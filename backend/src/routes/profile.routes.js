import express from "express";
import {
  deleteProfile,
  getProfile,
  updatePassword,
  updateProfile,
  updatePrivacy,
  updateNotificationPrefs,
  getBlockedUsers,
  blockUser,
  unblockUser,
} from "../controllers/profile.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload, validateUploadSignature } from "../middlewares/upload.middleware.js";
import { rateLimit, validateObjectIdParam } from "../middlewares/security.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getProfile);
router.put("/", rateLimit({ windowMs: 60 * 1000, max: 15 }), upload.single("profilePic"), handleUploadError, validateUploadSignature, updateProfile);
router.patch("/password", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), updatePassword);
router.patch("/privacy", rateLimit({ windowMs: 60 * 1000, max: 20 }), updatePrivacy);
router.patch("/notifications", rateLimit({ windowMs: 60 * 1000, max: 20 }), updateNotificationPrefs);
router.get("/blocked", getBlockedUsers);
router.post("/block/:id", validateObjectIdParam("id"), blockUser);
router.delete("/block/:id", validateObjectIdParam("id"), unblockUser);
router.delete("/", rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), deleteProfile);

export default router;
