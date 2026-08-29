import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Call from "../models/call.model.js";
import User from "../models/user.model.js";
import { sendIncomingCallNotification } from "./notifications.js";

const app = express();
const server = http.createServer(app);

const configuredFrontendURL =
    process.env.FRONTEND_URL || process.env.CLIENT_URL;

const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(configuredFrontendURL
        ? [configuredFrontendURL.replace(/\/$/, "")]
        : []),
];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
    },
    maxHttpBufferSize: 100_000,
});

// Online users map = { userId: Set(socketId) }
const userSocketMap = {};

function getReceiverSocketId(userId) {
    return [...(userSocketMap[String(userId)] || [])];
}

function relayCall(event, receiverId, payload) {
    getReceiverSocketId(receiverId).forEach((socketId) => {
        io.to(socketId).emit(event, payload);
    });
}

const isObjectId = (value) => mongoose.isValidObjectId(value);
const isCallId = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
const isCallType = (value) => value === "audio" || value === "video";
const isSmallPayload = (value) => {
    try { return JSON.stringify(value).length <= 80_000; } catch { return false; }
};

async function participantCall(callId, userId, receiverId) {
    if (!isCallId(callId) || !isObjectId(receiverId)) return null;
    return Call.findOne({
        callId,
        $or: [
            { caller: userId, receiver: receiverId },
            { caller: receiverId, receiver: userId },
        ],
    });
}

/*
 * Authenticate every Socket.IO connection.
 *
 * IMPORTANT:
 * The user's identity comes from the verified JWT cookie.
 * We do NOT trust socket.handshake.query.userId.
 */
io.use(async (socket, next) => {
    try {
        const cookieHeader = socket.handshake.headers.cookie;

        if (!cookieHeader) {
            return next(new Error("Unauthorized"));
        }

        const cookies = Object.fromEntries(
            cookieHeader.split(";").map((cookie) => {
                const [key, ...value] = cookie.trim().split("=");

                return [
                    key,
                    decodeURIComponent(value.join("=")),
                ];
            })
        );

        const token = cookies.jwt;

        if (!token) {
            return next(new Error("Unauthorized"));
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const user = await User.findById(decoded.userId)
            .select("_id");

        if (!user) {
            return next(new Error("Unauthorized"));
        }

        // Server determines the user's identity.
        socket.userId = user._id.toString();

        next();
    } catch (error) {
        console.error(
            "Socket authentication failed:",
            error.message
        );

        next(new Error("Unauthorized"));
    }
});

io.on("connection", (socket) => {
    // IMPORTANT:
    // This comes from the verified JWT, not from the browser.
    const userId = socket.userId;

    userSocketMap[userId] ||= new Set();
    userSocketMap[userId].add(socket.id);

    console.log(`User connected: ${userId}`);

    io.emit(
        "getOnlineUsers",
        Object.keys(userSocketMap)
    );

    let lastTypingAt = 0;
    socket.on("typing", ({ receiverId, isTyping } = {}) => {
        if (!isObjectId(receiverId) || typeof isTyping !== "boolean" || Date.now() - lastTypingAt < 300) return;
        lastTypingAt = Date.now();
        const receiverSocketIds =
            getReceiverSocketId(receiverId);

        receiverSocketIds.forEach((socketId) => {
            io.to(socketId).emit("typing", {
                senderId: userId,
                isTyping,
            });
        });
    });

    socket.on(
        "call:initiate",
        async ({
            receiverId,
            callId,
            callType,
            ...payload
        } = {}) => {
            try {
                if (!isObjectId(receiverId) || !isCallId(callId) || !isCallType(callType) || !isSmallPayload(payload)) {
                    return socket.emit("call:failed", { callId, message: "Invalid call request." });
                }
                if (String(receiverId) === userId || !(await User.exists({ _id: receiverId }))) {
                    return socket.emit("call:failed", { callId, message: "Recipient is unavailable." });
                }
                await Call.create({
                    callId,
                    caller: userId,
                    receiver: receiverId,
                    type: callType,
                    status: "ringing",
                });

                relayCall(
                    "call:ring",
                    receiverId,
                    {
                        ...payload,
                        callId,
                        callType,
                        callerId: userId,
                    }
                );

                if (
                    getReceiverSocketId(receiverId).length ===
                    0
                ) {
                    const caller =
                        await User.findById(userId)
                            .select(
                                "fullName profilePic"
                            );

                    if (caller) {
                        sendIncomingCallNotification({
                            receiverId,
                            caller,
                            callId,
                            callType,
                        }).catch((error) =>
                            console.error(
                                "Call push failed:",
                                error.message
                            )
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "Call initiation failed:",
                    error.message
                );

                socket.emit("call:failed", {
                    callId,
                });
            }
        }
    );

    socket.on(
        "call:ringing",
        async ({ receiverId, callId, ...payload } = {}) => {
            const call = await participantCall(callId, userId, receiverId);
            if (!call || call.receiver.toString() !== userId || call.status !== "ringing" || !isSmallPayload(payload)) return;
            relayCall(
                "call:ringing",
                receiverId,
                {
                    ...payload,
                    callId,
                    userId,
                }
            );
        }
    );

    socket.on(
        "call:accept",
        async ({
            receiverId,
            callId,
            ...payload
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId) || !isSmallPayload(payload)) return socket.emit("call:failed", { callId });
            const call =
                await Call.findOneAndUpdate(
                    {
                        callId,
                        receiver: userId,
                        caller: receiverId,
                        status: "ringing",
                    },
                    {
                        status: "accepted",
                        answeredAt: new Date(),
                    }
                );

            if (!call) {
                return socket.emit(
                    "call:failed",
                    {
                        callId,
                        message:
                            "This call is no longer available.",
                    }
                );
            }

            relayCall(
                "call:accept",
                receiverId,
                {
                    ...payload,
                    callId,
                    userId,
                }
            );
        }
    );

    socket.on(
        "call:reject",
        async ({
            receiverId,
            callId,
            ...payload
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId) || !isSmallPayload(payload)) return;
            const call = await Call.findOneAndUpdate(
                {
                    callId,
                    receiver: userId,
                    caller: receiverId,
                    status: "ringing",
                },
                {
                    status: "rejected",
                    endedAt: new Date(),
                    duration: 0,
                }
            );

            if (!call) return socket.emit("call:failed", { callId });
            relayCall(
                "call:reject",
                receiverId,
                {
                    ...payload,
                    callId,
                    userId,
                }
            );
        }
    );

    socket.on(
        "call:end",
        async ({
            receiverId,
            callId,
            ...payload
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId) || !isSmallPayload(payload)) return;
            const call = await Call.findOne({
                callId,
                $or: [
                    { caller: userId },
                    { receiver: userId },
                ],
            });

            if (call) {
                const endedAt = new Date();

                const duration = call.answeredAt
                    ? Math.max(
                          0,
                          Math.floor(
                              (endedAt -
                                  call.answeredAt) /
                                  1000
                          )
                      )
                    : 0;

                await Call.updateOne(
                    { _id: call._id },
                    {
                        status: call.answeredAt
                            ? "completed"
                            : call.caller.toString() ===
                              userId
                            ? "cancelled"
                            : "missed",
                        endedAt,
                        duration,
                    }
                );
            }

            if (!call) return socket.emit("call:failed", { callId });
            const peerId = call.caller.toString() === userId ? call.receiver : call.caller;
            relayCall(
                "call:end",
                peerId,
                {
                    ...payload,
                    callId,
                    userId,
                }
            );
        }
    );

    socket.on(
        "call:signal",
        async ({ receiverId, callId, ...payload } = {}) => {
            const call = await participantCall(callId, userId, receiverId);
            if (!call || !["ringing", "accepted"].includes(call.status) || !isSmallPayload(payload)) return;
            relayCall(
                "call:signal",
                receiverId,
                {
                    ...payload,
                    callId,
                    userId,
                }
            );
        }
    );

    socket.on("disconnect", () => {
        if (userSocketMap[userId]) {
            userSocketMap[userId].delete(
                socket.id
            );

            if (
                userSocketMap[userId].size === 0
            ) {
                delete userSocketMap[userId];
            }
        }

        io.emit(
            "getOnlineUsers",
            Object.keys(userSocketMap)
        );

        console.log(`User disconnected: ${userId}`);
    });
});

export {
    app,
    server,
    io,
    getReceiverSocketId,
};
