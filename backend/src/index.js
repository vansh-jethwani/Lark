import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import dbConnect from "./lib/db.js";
import User from "./models/user.model.js";
import Message from "./models/message.model.js";
import { clerkMiddleware } from "@clerk/express";
import job from "./lib/cron.js";
import clerkWebhook from "./webhooks/clerk.webhooks.js";
import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import {app, server} from "./lib/socket.js"

dotenv.config();
const PORT = process.env.PORT;
const frontendURL = process.env.FRONTEND_URL?.replace(/\/$/, "");


// learn
const publicDir = path.join(process.cwd(), 'public')

// it's important that you don't parse the webhook event data, it should be in the raw format
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }), clerkWebhook);

app.use(express.json());
app.use(cors({
    origin: frontendURL,
    credentials: true
}));
app.use(clerkMiddleware());

app.get("/ping", (req, res) => {
    return res.status(200).json({ message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// if the public directory exists, serve the static files
// this is for the production build
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir))

    app.get("/{*any}", (req, res, next) => {
        res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
    });
}

server.listen(PORT, () => {
    dbConnect();
    console.log(`Server started on port ${PORT}`);

    if(process.env.NODE_ENV === "production"){
        job.start();
    }
});
