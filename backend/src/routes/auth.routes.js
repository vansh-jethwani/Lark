import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { deleteCallHistory, getCallHistory } from "../controllers/call.controller.js";
import { checkAuth, login, logout, resendEmailOtp, signup, verifyEmailOtp, forgotPassword, verifyResetOtp, resetPassword, updatePublicKey, getPublicKey } from "../controllers/auth.controller.js";
import { rateLimit, validateObjectIdParam } from "../middlewares/security.middleware.js";


const router = express.Router();

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
router.post("/signup", authLimit, signup);
router.post("/verify-email-otp", authLimit, verifyEmailOtp);
router.post("/resend-email-otp", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), resendEmailOtp);
router.post("/login", authLimit, login);
router.post("/logout", logout);
router.post("/forgot-password", authLimit, forgotPassword);
router.post("/verify-reset-otp", authLimit, verifyResetOtp);
router.post("/reset-password", authLimit, resetPassword);
router.get("/check", protectRoute, checkAuth)
router.post("/public-key", protectRoute, updatePublicKey);
router.get("/public-key/:id", protectRoute, validateObjectIdParam("id"), getPublicKey);
router.get("/calls", protectRoute, getCallHistory);
router.delete("/calls/:id", protectRoute, validateObjectIdParam("id"), deleteCallHistory);


export default router;
