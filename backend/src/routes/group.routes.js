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
import { handleUploadError, upload, validateUploadSignature } from "../middlewares/upload.middleware.js";
import { rateLimit, validateObjectIdParam } from "../middlewares/security.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", listGroups);
router.post("/", rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), createGroup);
router.get("/:id/messages", validateObjectIdParam("id"), getGroupMessages);
router.get("/:id/media", validateObjectIdParam("id"), getGroupMedia);
router.post("/:id/messages", validateObjectIdParam("id"), rateLimit({ windowMs: 60 * 1000, max: 60, key: (req) => String(req.userId || req.ip) }), upload.single("media"), handleUploadError, validateUploadSignature, sendGroupMessage);
router.get("/:id", validateObjectIdParam("id"), getGroupDetails);
router.patch("/:id", validateObjectIdParam("id"), updateGroup);
router.patch("/:id/permissions", validateObjectIdParam("id"), updatePermissions);
router.post("/:id/members", validateObjectIdParam("id"), rateLimit({ windowMs: 60 * 1000, max: 20 }), addMembers);
router.delete("/:id/members/:userId", validateObjectIdParam("id"), validateObjectIdParam("userId"), rateLimit({ windowMs: 60 * 1000, max: 20 }), removeMember);
router.post("/:id/leave", validateObjectIdParam("id"), leaveGroup);
router.post("/:id/admins/:userId/promote", validateObjectIdParam("id"), validateObjectIdParam("userId"), promoteAdmin);
router.post("/:id/admins/:userId/demote", validateObjectIdParam("id"), validateObjectIdParam("userId"), demoteAdmin);

export default router;
