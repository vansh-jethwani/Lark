import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { handleUploadError, upload } from "../middlewares/upload.middleware.js";
import { chatWithAI, getAIMessages } from "../controllers/ai.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/messages", getAIMessages);
router.post("/chat", upload.single("file"), handleUploadError, chatWithAI);

export default router;