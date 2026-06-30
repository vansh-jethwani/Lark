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
} from "../controllers/message.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";


const router = express.Router();

router.use(protectRoute);

router.get("/users", getUsersForSidebar);
router.get("/conversations", getConversationsForSidebar);
router.get("/:id", getMessages);
router.patch("/:id/read", markConversationAsRead);
router.post("/send/:id", upload.single("media"), handleUploadError, sendMessage);
router.patch("/pin/:id", togglePinMessage);
router.post("/forward/:id", forwardMessage);
router.patch("/edit/:id", protectRoute, editMessage);
router.patch("/reaction/:id", toggleReaction);
router.delete("/delete/:id", protectRoute, deleteMessage);


export default router;
