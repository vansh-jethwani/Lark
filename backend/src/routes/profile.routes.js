import express from "express";
import {
  deleteProfile,
  getProfile,
  updateProfile,
} from "../controllers/profile.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getProfile);
router.put("/", upload.single("profilePic"), handleUploadError, updateProfile);
router.delete("/", deleteProfile);

export default router;
