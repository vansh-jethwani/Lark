import bcrypt from "bcryptjs";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Call from "../models/call.model.js";
import Group from "../models/group.model.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { presentMessageMedia } from "../lib/media.js";
import { disconnectUserSockets } from "../lib/socket.js";

function presentProfilePic(profilePic) {
  // Database stores the private ImageKit path; clients get a short-lived
  // signed URL, the same presentation sanitizeGroup applies to group photos.
  if (typeof profilePic === "string" && profilePic.startsWith("/")) {
    return presentMessageMedia({ image: profilePic }).image;
  }
  return profilePic || "";
}

function serializeProfile(user) {
  return {
    _id: user._id,
    email: user.email,
    fullName: user.fullName,
    username: user.username,
    bio: user.bio || "",
    phoneNumber: user.phoneNumber || "",
    authProvider: user.authProvider || "password",
    profilePic: presentProfilePic(user.profilePic),
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
      const { filePath } = await uploadChatMedia(req.file);
      profilePic = filePath;
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
    if (error.code === 11000) return res.status(409).json({ message: "Username is already taken." });
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updatePassword(req, res) {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirmation do not match." });
    }

    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    // Revoke every existing session: JWTs embed tokenVersion, so bumping it
    // here invalidates all previously issued tokens.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.status(200).json({ message: "Password updated." });
  } catch (error) {
    console.log("Error in updatePassword:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteProfile(req, res) {
  try {
    const password = String(req.body.password || "");

    if (!password) {
      return res.status(400).json({ message: "Account password is required." });
    }

    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Incorrect account password." });
    }

    // Cut the realtime channel first: a deleted account must not keep a live
    // authenticated socket that still receives events or drives calls.
    disconnectUserSockets(req.userId);
    // Pull the user from every group so populate("members") never yields null
    // entries that would crash group broadcasts.
    await Group.updateMany({ members: req.userId }, { $pull: { members: req.userId, admins: req.userId } });
    await Message.deleteMany({
      $or: [{ senderId: req.userId }, { receiverId: req.userId }],
    });
    await Call.deleteMany({ $or: [{ caller: req.userId }, { receiver: req.userId }] });
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
