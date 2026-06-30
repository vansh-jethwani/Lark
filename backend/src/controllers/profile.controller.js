import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";

function serializeProfile(user) {
  return {
    _id: user._id,
    email: user.email,
    fullName: user.fullName,
    username: user.username,
    bio: user.bio || "",
    phoneNumber: user.phoneNumber || "",
    authProvider: user.authProvider || "password",
    profilePic: user.profilePic || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

export async function getProfile(req, res) {
  res.status(200).json(serializeProfile(req.user));
}

export async function updateProfile(req, res) {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const username = normalizeUsername(req.body.username);
    const bio = String(req.body.bio || "").trim();

    if (!fullName) {
      return res.status(400).json({ message: "Full name is required." });
    }

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({
        message: "Username must be 3-24 characters and use letters, numbers, or underscores.",
      });
    }

    if (bio.length > 160) {
      return res.status(400).json({ message: "Bio must be 160 characters or fewer." });
    }

    const existingUser = await User.findOne({
      username,
      _id: { $ne: req.userId },
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({ message: "Username is already taken." });
    }

    let profilePic = req.user.profilePic;
    if (req.file) {
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Profile photo must be an image." });
      }

      if (!hasImagekitConfig()) {
        return res.status(503).json({ message: "Profile photo upload is not configured." });
      }
      profilePic = await uploadChatMedia(req.file);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      {
        fullName,
        username,
        bio,
        profilePic,
      },
      { new: true, runValidators: true },
    );

    res.status(200).json(serializeProfile(updatedUser));
  } catch (error) {
    console.log("Error in updateProfile:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteProfile(req, res) {
  try {
    const { confirmation } = req.body;

    if (confirmation !== "DELETE") {
      return res.status(400).json({ message: "Type DELETE to confirm account deletion." });
    }

    await Message.deleteMany({
      $or: [{ senderId: req.userId }, { receiverId: req.userId }],
    });
    await User.findByIdAndDelete(req.userId);
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({ message: "Account deleted." });
  } catch (error) {
    console.log("Error in deleteProfile:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
