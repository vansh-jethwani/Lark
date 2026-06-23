import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    clerkUserId: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    profilePicture: {
        type: String,
        default: ""
    },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;