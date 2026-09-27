import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Call from "../models/call.model.js";
import Group from "../models/group.model.js";
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

// Share realtime events across server instances when Redis is reachable.
// Without the adapter every instance only sees its own in-process sockets,
// so DMs, typing, and calls silently break on any multi-instance deploy.
try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    // Keep ioredis connection errors from becoming uncaught exceptions.
    pubClient.on("error", () => {});
    subClient.on("error", () => {});
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO Redis adapter enabled");
} catch (error) {
    console.warn("Socket.IO Redis adapter disabled:", error.message);
}

// Delivery addressing. Every socket joins a room named for its owner, so
// `io.to(userRoom(id))` reaches that user's sockets on ANY server instance
// when the Redis adapter is enabled (on a single instance it behaves exactly
// like the old in-process map). getReceiverSocketId() keeps its name and
// signature so existing call sites keep working, but now returns room
// targets instead of raw socket ids — `io.to()` accepts both.
const userRoom = (userId) => `user:${String(userId)}`;

// Local socket ids on THIS instance (fast path for local-only checks and as
// a fallback if a cluster-wide query fails).
const userSocketMap = {};

function getLocalSocketIds(userId) {
    return [...(userSocketMap[String(userId)] || [])];
}

function getReceiverSocketId(userId) {
    return [userRoom(userId)];
}

// Cluster-aware "is this user online anywhere" check.
async function isUserOnline(userId) {
    try {
        const sockets = await io.in(userRoom(userId)).fetchSockets();
        return sockets.length > 0;
    } catch {
        return getLocalSocketIds(userId).length > 0;
    }
}

// Cluster-aware list of online user ids (drives the frontend green dots).
async function getOnlineUserIds() {
    try {
        const sockets = await io.fetchSockets();
        return [...new Set(sockets.map((s) => s.data.userId).filter(Boolean))];
    } catch {
        return Object.keys(userSocketMap);
    }
}

function emitOnlineUsers() {
    getOnlineUserIds()
        .then((ids) => io.emit("getOnlineUsers", ids))
        .catch(() => {});
}

// Forcefully close every socket a user holds (used on account deletion).
function disconnectUserSockets(userId) {
    io.in(userRoom(userId)).disconnectSockets(true);
}

// Only genuine WebRTC signaling fields may be relayed to the peer. Identity
// fields (caller name/avatar) are resolved server-side from the authenticated
// user below, so a client can never spoof them on the callee's ringing screen.
function pickSignalingFields(payload = {}) {
    const picked = {};
    const signal = payload?.signal;
    if (signal && typeof signal === "object" && !Array.isArray(signal)) {
        const cleaned = {};
        if (signal.candidate && typeof signal.candidate === "object") cleaned.candidate = signal.candidate;
        if (signal.description && typeof signal.description === "object") cleaned.description = signal.description;
        if (Object.keys(cleaned).length > 0) picked.signal = cleaned;
    }
    return picked;
}

function relayCall(event, receiverId, payload) {
    io.to(userRoom(receiverId)).emit(event, payload);
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
            .select("_id tokenVersion");

        if (!user) {
            return next(new Error("Unauthorized"));
        }

        // Same session-revocation rule as the REST middleware: a password
        // change bumps tokenVersion and invalidates older sockets' tokens.
        if (
            typeof decoded.tokenVersion === "number" &&
            user.tokenVersion !== decoded.tokenVersion
        ) {
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
    socket.data.userId = userId;
    socket.join(userRoom(userId));

    console.log(`User connected: ${userId}`);

    emitOnlineUsers();

    let lastTypingAt = 0;
    socket.on("typing", async ({ receiverId, isTyping } = {}) => {
        if (!isObjectId(receiverId) || typeof isTyping !== "boolean" || Date.now() - lastTypingAt < 300) return;
        lastTypingAt = Date.now();
        // Typing pings are only meaningful to a real user or a group the
        // sender belongs to; drop anything else.
        const [receiverExists, groupExists] = await Promise.all([
            User.exists({ _id: receiverId }),
            Group.exists({ _id: receiverId, members: userId }),
        ]).catch(() => [null, null]);
        if (!receiverExists && !groupExists) return;
        // Group typing: a group id owns no sockets, so relay the event to
        // every other member's sockets. The client keys typing state by
        // senderId and resolves names itself.
        if (groupExists) {
            const group = await Group.findById(receiverId).select("members").lean().catch(() => null);
            const rooms = ((group && group.members) || [])
                .map(String)
                .filter((id) => id !== userId)
                .map(userRoom);
            if (rooms.length > 0) {
                io.to(rooms).emit("typing", { senderId: userId, isTyping });
            }
            return;
        }
        io.to(userRoom(receiverId)).emit("typing", {
            senderId: userId,
            isTyping,
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

                // Identity shown on the callee's ringing screen is resolved
                // server-side from the authenticated user: the client-supplied
                // payload is not trusted for it (spoofing risk).
                const caller = await User.findById(userId).select("fullName profilePic");

                relayCall(
                    "call:ring",
                    receiverId,
                    {
                        callId,
                        callType,
                        callerId: userId,
                        caller: caller ? { name: caller.fullName, avatar: caller.profilePic } : null,
                    }
                );

                // An unanswered call must not stay "ringing" forever.
                const ringTimeout = setTimeout(() => {
                    Call.findOneAndUpdate(
                        { callId, status: "ringing" },
                        { status: "missed", endedAt: new Date(), duration: 0 }
                    ).then((expired) => {
                        if (!expired) return;
                        relayCall("call:missed", userId, { callId });
                        relayCall("call:missed", receiverId, { callId });
                    }).catch((error) => console.error("Ring timeout cleanup failed:", error.message));
                }, 60_000);
                if (typeof ringTimeout.unref === "function") ringTimeout.unref();

                if (!(await isUserOnline(receiverId))) {
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
        async ({ receiverId, callId } = {}) => {
            const call = await participantCall(callId, userId, receiverId);
            if (!call || call.receiver.toString() !== userId || call.status !== "ringing") return;
            relayCall(
                "call:ringing",
                receiverId,
                {
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
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId)) return socket.emit("call:failed", { callId });
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
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId)) return;
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
        } = {}) => {
            if (!isObjectId(receiverId) || !isCallId(callId)) return;
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
            if (!call || !["ringing", "accepted"].includes(call.status)) return;
            const signaling = pickSignalingFields(payload);
            if (!isSmallPayload(signaling)) return;
            relayCall(
                "call:signal",
                receiverId,
                {
                    ...signaling,
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

        // Calls left "ringing" by a disconnecting user must not linger: the
        // caller's own unanswered calls become "cancelled", everyone else's
        // become "missed".
        Call.updateMany(
            { status: "ringing", caller: userId },
            { status: "cancelled", endedAt: new Date(), duration: 0 }
        ).catch((error) => console.error("Disconnect call cleanup failed:", error.message));
        Call.updateMany(
            { status: "ringing", receiver: userId },
            { status: "missed", endedAt: new Date(), duration: 0 }
        ).catch((error) => console.error("Disconnect call cleanup failed:", error.message));

        emitOnlineUsers();

        console.log(`User disconnected: ${userId}`);
    });
});

export {
    app,
    server,
    io,
    userRoom,
    getReceiverSocketId,
    isUserOnline,
    disconnectUserSockets,
};
