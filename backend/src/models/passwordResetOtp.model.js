import mongoose from "mongoose";

const passwordResetOtpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    otpHash: {
        type: String,
        required: true,
    },
    otpExpiresAt: {
        type: Date,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    lastSentAt: {
        type: Date,
        default: null,
    },
    resendCount: {
        type: Number,
        default: 0,
    },
    verified: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

passwordResetOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // Expire after 1 hour

const PasswordResetOtp = mongoose.model("PasswordResetOtp", passwordResetOtpSchema);
export default PasswordResetOtp;
