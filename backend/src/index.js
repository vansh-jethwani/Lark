// import dotenv from "dotenv";
// dotenv.config();
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import dbConnect from "./lib/db.js";
import User from "./models/user.model.js";
import Message from "./models/message.model.js";
import job from "./lib/cron.js";
import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import {app, server} from "./lib/socket.js"
import profileRoutes from "./routes/profile.routes.js";
import groupRoutes from "./routes/group.routes.js";
import { requireTrustedOrigin, securityHeaders } from "./middlewares/security.middleware.js";

dotenv.config();
const PORT = process.env.PORT;
const configuredFrontendURL = process.env.FRONTEND_URL || process.env.CLIENT_URL;
const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(configuredFrontendURL ? [configuredFrontendURL.replace(/\/$/, "")] : []),
]);


// learn
const publicDir = path.join(process.cwd(), 'public')

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true
}));
app.use(requireTrustedOrigin(allowedOrigins));

app.get("/ping", (req, res) => {
    return res.status(200).json({ message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/groups", groupRoutes);

app.use((error, req, res, next) => {
    console.error("Unhandled request error");
    res.status(error.status || 500).json({ message: "Internal server error" });
});

// if the public directory exists, serve the static files
// this is for the production build
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir))

    app.get("/{*any}", (req, res, next) => {
        res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
    });
}

async function startServer() {
    try {
        await dbConnect();
        server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);

    if(process.env.NODE_ENV === "production"){
        job.start();
    }
        });
    } catch (error) {
        console.error("Unable to start server:", error.message);
        process.exit(1);
    }
}

startServer();
