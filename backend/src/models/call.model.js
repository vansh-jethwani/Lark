import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, unique: true, index: true },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["audio", "video"], required: true },
    status: {
      type: String,
      enum: ["ringing", "accepted", "completed", "rejected", "missed", "cancelled", "failed"],
      default: "ringing",
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: Date,
    endedAt: Date,
    duration: { type: Number, default: 0, min: 0 },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ deletedFor: 1 });
// Ended calls are pruned automatically after 90 days. Documents without
// endedAt (still ringing/accepted) are never removed by this index.
callSchema.index({ endedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.model("Call", callSchema);
