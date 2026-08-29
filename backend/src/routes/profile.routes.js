import express from "express";
import {
  deleteProfile,
  getProfile,
  updatePassword,
  updateProfile,
} from "../controllers/profile.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload, validateUploadSignature } from "../middlewares/upload.middleware.js";
import { rateLimit } from "../middlewares/security.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getProfile);
router.put("/", rateLimit({ windowMs: 60 * 1000, max: 15 }), upload.single("profilePic"), handleUploadError, validateUploadSignature, updateProfile);
router.patch("/password", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), updatePassword);
router.delete("/", rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), deleteProfile);

export default router;
