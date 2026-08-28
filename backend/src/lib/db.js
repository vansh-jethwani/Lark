import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function dbConnect() {
    try {
        if (!MONGO_URI) {
            throw new Error("Please provide MONGO_URI in the environment variables.");
        }
        if (mongoose.connection.readyState === 1) return mongoose.connection;
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 20,
            minPoolSize: 2,
        });
        console.log("MongoDB connected");
        return mongoose.connection;
    } catch (error) {
        console.log("MongoDB Connection Error!! " + error.message);
        throw error;
        // 0 -> success
        // 1 -> failure
    }
};

export default dbConnect;
