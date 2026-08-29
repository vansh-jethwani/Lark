import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: function () { return !this.groupId; },
    default: null,
  },
  // Kept optional so existing direct-message documents need no migration.
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null, index: true },
  text: {
    type: String,
    default: ""
  },
  image: {
    type: String,
  },
  imageFileId: { type: String, default: "" },
  video: {
    type: String,
  },
  videoFileId: { type: String, default: "" },
  audio: {
    type: String,
    default: "",
  },
  audioFileId: { type: String, default: "" },
  file: {
    type: String,
    default: "",
  },
  fileFileId: { type: String, default: "" },
  fileName: {
    type: String,
    default: "",
  },
  fileType: {
    type: String,
    default: "",
  },
  fileSize: {
    type: Number,
    default: 0,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
  deletedFor: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: [],
    },
  ],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  isForwarded: {
    type: Boolean,
    default: false,
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  pinnedAt: {
    type: Date,
    default: null,
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  reactions: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      emoji: {
        type: String,
        required: true,
      },
    },
  ],
}, { timestamps: true });

messageSchema.index({ groupId: 1, createdAt: 1 });
// Direct-message history, sidebar lookups, and unread counts all use these paths.
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, readAt: 1, createdAt: -1 });
messageSchema.index({ groupId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;
