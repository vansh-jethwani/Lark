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
    isAI: {
    type: Boolean,
    default: false,
    },
  },
  { timestamps: true }, // createdAt & updatedAt
);

const User = mongoose.model("User", userSchema);

export default User;
