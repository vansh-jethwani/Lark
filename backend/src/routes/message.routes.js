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
    uploadMedia,
} from "../controllers/message.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";


const router = express.Router();

router.use(protectRoute);

router.get("/users", getUsersForSidebar);
router.get("/conversations", getConversationsForSidebar);
router.post("/upload", upload.single("media"), handleUploadError, uploadMedia);
router.get("/:id/media", getSharedMedia);
router.get("/:id", getMessages);
router.patch("/:id/read", markConversationAsRead);
router.post("/send/:id", upload.single("media"), handleUploadError, sendMessage);
router.patch("/pin/:id", togglePinMessage);
router.post("/forward/:id", forwardMessage);
router.patch("/edit/:id", protectRoute, editMessage);
router.patch("/reaction/:id", toggleReaction);
router.delete("/delete/:id", protectRoute, deleteMessage);


export default router;
