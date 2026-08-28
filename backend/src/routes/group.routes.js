import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import {
  addMembers,
  createGroup,
  demoteAdmin,
  getGroupDetails,
  leaveGroup,
  listGroups,
  promoteAdmin,
  removeMember,
  updateGroup,
  updatePermissions,
} from "../controllers/group.controller.js";
import { getGroupMedia, getGroupMessages, sendGroupMessage } from "../controllers/group.controller.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", listGroups);
router.post("/", createGroup);
router.get("/:id/messages", getGroupMessages);
router.get("/:id/media", getGroupMedia);
router.post("/:id/messages", upload.single("media"), handleUploadError, sendGroupMessage);
router.get("/:id", getGroupDetails);
router.patch("/:id", updateGroup);
router.patch("/:id/permissions", updatePermissions);
router.post("/:id/members", addMembers);
router.delete("/:id/members/:userId", removeMember);
router.post("/:id/leave", leaveGroup);
router.post("/:id/admins/:userId/promote", promoteAdmin);
router.post("/:id/admins/:userId/demote", demoteAdmin);

export default router;
