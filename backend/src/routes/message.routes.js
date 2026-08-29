import express from "express";
import {
    getUsersForSidebar,
    getConversationsForSidebar,
    getMessages,
    markConversationAsRead,
    sendMessage,
    togglePinMessage,
    forwardMessage,
    editMessage,
    toggleReaction,
    deleteMessage,
    getSharedMedia,
    getFreshMediaUrl,
    uploadMedia,
} from "../controllers/message.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload, validateUploadSignature } from "../middlewares/upload.middleware.js";
import { rateLimit, validateObjectIdParam } from "../middlewares/security.middleware.js";


const router = express.Router();

router.use(protectRoute);

router.get("/users", rateLimit({ windowMs: 60 * 1000, max: 30 }), getUsersForSidebar);
router.get("/conversations", getConversationsForSidebar);
router.post("/upload", rateLimit({ windowMs: 60 * 1000, max: 20 }), upload.single("media"), handleUploadError, validateUploadSignature, uploadMedia);
router.get("/media/:id/:type", validateObjectIdParam("id"), getFreshMediaUrl);
router.get("/:id/media", validateObjectIdParam("id"), getSharedMedia);
router.get("/:id", validateObjectIdParam("id"), getMessages);
router.patch("/:id/read", validateObjectIdParam("id"), markConversationAsRead);
router.post("/send/:id", validateObjectIdParam("id"), rateLimit({ windowMs: 60 * 1000, max: 60, key: (req) => String(req.userId || req.ip) }), upload.single("media"), handleUploadError, validateUploadSignature, sendMessage);
router.patch("/pin/:id", validateObjectIdParam("id"), togglePinMessage);
router.post("/forward/:id", validateObjectIdParam("id"), rateLimit({ windowMs: 60 * 1000, max: 30 }), forwardMessage);
router.patch("/edit/:id", validateObjectIdParam("id"), editMessage);
router.patch("/reaction/:id", validateObjectIdParam("id"), toggleReaction);
router.delete("/delete/:id", validateObjectIdParam("id"), deleteMessage);


export default router;
