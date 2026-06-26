import express from "express";
import http from "http";
import { Server } from "socket.io";
const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
const io = new Server(server, { cors: { origin: [allowedOrigin] } });

function getReceiverSocketId(userId){
    return [...(userSocketMap[String(userId)] || [])];
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
})

export { app, server, io, getReceiverSocketId };
