import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import dbConnect from "./src/lib/db.js";
import User from "./src/models/user.model.js";
import Message from "./src/models/message.model.js";
import { clerkMiddleware } from "@clerk/express";

dotenv.config();
const PORT = process.env.PORT;
const frontendURL = process.env.FRONTEND_URL;

const publicDir = path.join(process.cwd(), 'public')

const app = express();
app.use(express.json());
app.use(cors({
    origin: [frontendURL, Credential = true]
}));
app.use(clerkMiddleware());

app.get("/ping", (req, res) => {
    return res.status(200).json({ message: "Server is running" });
});

// if the public directory exists, serve the static files
// this is for the production build
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir))

    app.get("/{*any}", (req, res, next) => {
        res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
    });
}

app.listen(PORT, () => {
    dbConnect();
    console.log(`Server started on port ${PORT}`);
});
