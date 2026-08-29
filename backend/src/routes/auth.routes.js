import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { deleteCallHistory, getCallHistory } from "../controllers/call.controller.js";
import { checkAuth, login, logout, resendEmailOtp, signup, verifyEmailOtp } from "../controllers/auth.controller.js";
import { rateLimit, validateObjectIdParam } from "../middlewares/security.middleware.js";


const router = express.Router();

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
router.post("/signup", authLimit, signup);
router.post("/verify-email-otp", authLimit, verifyEmailOtp);
router.post("/resend-email-otp", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), resendEmailOtp);
router.post("/login", authLimit, login);
router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth)
router.get("/calls", protectRoute, getCallHistory);
router.delete("/calls/:id", protectRoute, validateObjectIdParam("id"), deleteCallHistory);


export default router;
