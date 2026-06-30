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
    required: true
  },
  text: {
    type: String,
    default: ""
  },
  image: {
    type: String,
  },
  video: {
    type: String,
  },
  audio: {
    type: String,
    default: "",
  },
  file: {
    type: String,
    default: "",
  },
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

const Message = mongoose.model("Message", messageSchema);
export default Message;
