import express from "express";
import {
  deleteProfile,
  getProfile,
  updatePassword,
  updateProfile,
} from "../controllers/profile.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getProfile);
router.put("/", upload.single("profilePic"), handleUploadError, updateProfile);
router.patch("/password", updatePassword);
router.delete("/", deleteProfile);

export default router;
