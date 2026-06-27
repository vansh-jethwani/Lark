import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { chatWithAI, getAIMessages } from "../controllers/ai.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/messages", getAIMessages);
router.post("/chat", chatWithAI);

export default router;