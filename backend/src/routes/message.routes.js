import express from "express";
import {
    getUsersForSidebar,
    getConversationsForSidebar,
    getMessages,
    markConversationAsRead,
    sendMessage
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


export default router;
