import express from "express";
import {
    getUsersForSidebar,
    getConversationsForSidebar,
    getMessages,
    sendMessage
} from "../controllers/message.controller.js";
import protectRoute from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/users", getUsersForSidebar);
router.get("/conversations", getConversationsForSidebar);
router.get("/:id", getMessages);
router.post("/send/:id", upload.fields([{ name: "media", maxCount: 10 }]), sendMessage);


export default router;
