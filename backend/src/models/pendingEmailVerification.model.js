import mongoose from "mongoose";

const pendingEmailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 },
  },
  { timestamps: true },
);

const PendingEmailVerification = mongoose.model(
  "PendingEmailVerification",
  pendingEmailVerificationSchema,
);

export default PendingEmailVerification;