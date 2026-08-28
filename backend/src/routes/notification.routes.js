import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { getPendingCall, getVapidPublicKey, subscribe, unsubscribe } from "../controllers/notification.controller.js";

const router = express.Router();
router.use(protectRoute);
router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", subscribe);
router.delete("/subscribe", unsubscribe);
router.get("/calls/:callId", getPendingCall);

export default router;
