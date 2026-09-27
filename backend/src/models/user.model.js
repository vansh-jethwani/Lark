import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    username:{
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    bio: {
      type: String,
      default: "",
      maxlength: 160,
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    authProvider: {
      type: String,
      default: "password",
    },
    profilePic: {
      type: String,
      default: "",
    },
    pushSubscriptions: {
      type: [{
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
        },
        expirationTime: { type: Date, default: null },
      }],
      default: [],
    },
    publicKey: {
      type: String,
      default: "",
    },
    // Bumped on every password change/reset. JWTs embed the version they were
    // issued with; a mismatch means the token was issued before the change and
    // must be rejected.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Privacy controls, editable from Settings → Privacy.
    privacy: {
      // Who may see this user's profile photo in user search / the sidebar.
      // ("contacts" is not offered: Lark has no contacts concept.)
      profilePhoto: {
        type: String,
        enum: ["everyone", "nobody"],
        default: "everyone",
      },
      // When false, this user neither sends read receipts nor sees others'.
      readReceipts: {
        type: Boolean,
        default: true,
      },
    },
    // Notification preferences, editable from Settings → Notifications.
    notificationPrefs: {
      messageSound: { type: Boolean, default: true },
      pushEnabled: { type: Boolean, default: true },
    },
    // Users this user has blocked. Blocked users cannot message or call
    // them, and neither side receives the other's messages/calls.
    blockedUsers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true }, // createdAt & updatedAt
);

const User = mongoose.model("User", userSchema);

export default User;
