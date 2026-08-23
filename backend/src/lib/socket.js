import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
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
    io.to(socketId).emit("typing", {
      senderId: userId,
      isTyping,
    });

      socket.on("call:initiate", ({ receiverId, ...payload }) => relayCall("call:ring", receiverId, { ...payload, callerId: userId }));
      socket.on("call:ringing", ({ receiverId, ...payload }) => relayCall("call:ringing", receiverId, { ...payload, userId }));
      socket.on("call:accept", ({ receiverId, ...payload }) => relayCall("call:accept", receiverId, { ...payload, userId }));
      socket.on("call:reject", ({ receiverId, ...payload }) => relayCall("call:reject", receiverId, { ...payload, userId }));
      socket.on("call:end", ({ receiverId, ...payload }) => relayCall("call:end", receiverId, { ...payload, userId }));
  });
});
})

export { app, server, io, getReceiverSocketId };
