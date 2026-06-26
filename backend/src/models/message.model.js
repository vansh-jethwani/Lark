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
    readAt: {
      type: Date,
      default: null,
    },
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);
export default Message;
