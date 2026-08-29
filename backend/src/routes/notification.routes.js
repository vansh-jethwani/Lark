import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { getPendingCall, getVapidPublicKey, subscribe, unsubscribe } from "../controllers/notification.controller.js";
import { rateLimit } from "../middlewares/security.middleware.js";

const router = express.Router();
router.use(protectRoute);
router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", rateLimit({ windowMs: 60 * 1000, max: 10 }), subscribe);
router.delete("/subscribe", rateLimit({ windowMs: 60 * 1000, max: 10 }), unsubscribe);
router.get("/calls/:callId", getPendingCall);

export default router;
