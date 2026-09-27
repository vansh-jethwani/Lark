import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  profilePic: { type: String, default: "" },
  description: { type: String, default: "", maxlength: 500 },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  permissions: {
    editInfo: { type: String, enum: ["admins", "members"], default: "admins" },
    addMembers: { type: String, enum: ["admins", "members"], default: "admins" },
    sendMessages: { type: String, enum: ["admins", "members"], default: "members" },
  },
  // Seconds after sending when new group messages expire. 0 = off.
  // Any member may change it (WhatsApp-style); applies to new messages only.
  disappearingDuration: { type: Number, default: 0 },
  // Group E2EE (sender-key style): a symmetric AES-256-GCM key shared by
  // members. The server NEVER sees the key — it only stores per-member
  // wrapped copies created client-side with ECDH (wrapper's private key +
  // member's public key). 0 = group not yet encrypted (legacy plaintext).
  keyVersion: { type: Number, default: 0 },
  // History of wrapped group keys, latest last (trimmed to a few entries).
  // Each entry covers exactly the members at rotation time, so members who
  // stay can still read older messages after a rotation or an app reload.
  // Wraps of removed members are dropped on every membership change.
  keyWraps: [{
    version: { type: Number, required: true },
    wrapperPublicKey: { type: String, default: "" },
    wraps: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      wrappedKey: { type: String, required: true },
    }],
  }],
}, { timestamps: true });
groupSchema.index({ members: 1, updatedAt: -1 });
groupSchema.index({ createdBy: 1, createdAt: -1 });
export default mongoose.model("Group", groupSchema);
