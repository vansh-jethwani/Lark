import mongoose from "mongoose";
import { dmSettingKey } from "../lib/disappearing.js";

// Per-conversation settings for direct-message conversations. Groups store
// their own settings on the Group document; DMs have no conversation
// document, so they live here under a canonical key.
const conversationSettingSchema = new mongoose.Schema(
  {
    // "dm:<smallerUserId>_<largerUserId>"
    key: { type: String, required: true, unique: true, index: true },
    // Seconds after sending when new messages expire. 0 = off.
    disappearingDuration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export { dmSettingKey };

const ConversationSetting = mongoose.model(
  "ConversationSetting",
  conversationSettingSchema
);

export default ConversationSetting;
