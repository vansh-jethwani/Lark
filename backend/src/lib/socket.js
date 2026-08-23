import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import Call from "../models/call.model.js";
const app = express();
const server = http.createServer(app);
const configuredFrontendURL = process.env.FRONTEND_URL || process.env.CLIENT_URL;
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(configuredFrontendURL ? [configuredFrontendURL.replace(/\/$/, "")] : []),
];
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

function getReceiverSocketId(userId){
    return [...(userSocketMap[String(userId)] || [])];
} 

function relayCall(event, receiverId, payload) {
  getReceiverSocketId(receiverId).forEach((socketId) => io.to(socketId).emit(event, payload));
}

// online users map = { userId: Set(socketId) }
const userSocketMap = {};
io.on("connection", (socket) => {
    const userId = String(socket.handshake.query.userId || "");

    if (userId) {
        userSocketMap[userId] ||= new Set();
        userSocketMap[userId].add(socket.id);
    }

    // io.emit() sends event to everyone - broadcast
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // socket.on() is used to listen for events
    socket.on("disconnect", () => {
        if (userId && userSocketMap[userId]) {
            userSocketMap[userId].delete(socket.id);

            if (userSocketMap[userId].size === 0) {
                delete userSocketMap[userId];
            }
        }

        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    })

    socket.on("typing", ({ receiverId, isTyping }) => {
        const receiverSocketIds = getReceiverSocketId(receiverId);
        receiverSocketIds.forEach((socketId) => {
            io.to(socketId).emit("typing", { senderId: userId, isTyping });
        });
    });

    socket.on("call:initiate", async ({ receiverId, callId, callType, ...payload }) => {
      try {
        await Call.create({ callId, caller: userId, receiver: receiverId, type: callType, status: "ringing" });
        relayCall("call:ring", receiverId, { ...payload, callId, callType, callerId: userId });
      } catch (error) {
        console.error("Call initiation failed:", error.message);
        socket.emit("call:failed", { callId });
      }
    });
    socket.on("call:ringing", ({ receiverId, ...payload }) => relayCall("call:ringing", receiverId, { ...payload, userId }));
    socket.on("call:accept", async ({ receiverId, callId, ...payload }) => {
      await Call.findOneAndUpdate({ callId, receiver: userId }, { status: "accepted", answeredAt: new Date() });
      relayCall("call:accept", receiverId, { ...payload, callId, userId });
    });
    socket.on("call:reject", async ({ receiverId, callId, ...payload }) => {
      await Call.findOneAndUpdate({ callId, receiver: userId }, { status: "rejected", endedAt: new Date(), duration: 0 });
      relayCall("call:reject", receiverId, { ...payload, callId, userId });
    });
    socket.on("call:end", async ({ receiverId, callId, ...payload }) => {
      const call = await Call.findOne({ callId, $or: [{ caller: userId }, { receiver: userId }] });
      if (call) {
        const endedAt = new Date();
        const duration = call.answeredAt ? Math.max(0, Math.floor((endedAt - call.answeredAt) / 1000)) : 0;
        await Call.updateOne({ _id: call._id }, { status: call.answeredAt ? "completed" : (call.caller.toString() === userId ? "cancelled" : "missed"), endedAt, duration });
      }
      relayCall("call:end", receiverId, { ...payload, callId, userId });
    });
    socket.on("call:signal", ({ receiverId, ...payload }) => relayCall("call:signal", receiverId, { ...payload, userId }));
});

export { app, server, io, getReceiverSocketId };
