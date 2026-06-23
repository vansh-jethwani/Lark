import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import dbConnect from "./src/lib/db.js";
import User from "./src/models/user.model.js";
import Message from "./src/models/message.model.js";
import { clerkMiddleware } from "@clerk/express";

dotenv.config();
const PORT = process.env.PORT;
const frontendURL = process.env.FRONTEND_URL;

const app = express();
app.use(express.json());
app.use(cors({
    origin: [frontendURL, Credential = true]
}));
app.use(clerkMiddleware());

app.get("/ping", (req, res) => {
    return res.status(200).json({ message: "Server is running" });
});



app.listen(PORT, () => {
    dbConnect();
    console.log(`Server started on port ${PORT}`);
});
