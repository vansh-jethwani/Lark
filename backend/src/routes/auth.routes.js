import express from "express";
import protectRoute from "../middlewares/auth.middleware.js";
import { checkAuth, login, logout, resendEmailOtp, signup, verifyEmailOtp } from "../controllers/auth.controller.js";


const router = express.Router();

router.post("/signup", signup);
router.post("/verify-email-otp", verifyEmailOtp);
router.post("/resend-email-otp", resendEmailOtp);
router.post("/login", login);
router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth)


export default router;
