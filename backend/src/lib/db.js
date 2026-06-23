import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function dbConnect() {
    try {
        if (!MONGO_URI) {
            throw new Error("Please provide MONGO_URI in the environment variables.");
        }
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected");
    } catch (error) {
        console.log("MongoDB Connection Error!! " + error.message);
        process.exit(1);
        // 0 -> success
        // 1 -> failure
    }
};

export default dbConnect;