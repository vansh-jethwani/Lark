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
  },
  { timestamps: true }, // createdAt & updatedAt
);

const User = mongoose.model("User", userSchema);

export default User;
