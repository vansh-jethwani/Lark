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
}, { timestamps: true });
groupSchema.index({ members: 1, updatedAt: -1 });
groupSchema.index({ createdBy: 1, createdAt: -1 });
export default mongoose.model("Group", groupSchema);
