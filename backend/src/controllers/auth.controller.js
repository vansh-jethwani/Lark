import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createRequire } from "module";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import PendingEmailVerification from "../models/pendingEmailVerification.model.js";
import { sendEmailVerificationCode } from "../lib/email.js";
import dotenv from "dotenv";
dotenv.config();

const require = createRequire(import.meta.url);
const disposableEmailDomains = new Set([
    ...require("disposable-email-domains"),
    "mailinator.com",
    "10minutemail.com",
    "tempmail.com",
    "guerrillamail.com",
    "yopmail.com",
]);

const COOKIE_NAME = "jwt";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 5;

function serializeUser(user) {
    return {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        bio: user.bio || "",
        phoneNumber: user.phoneNumber || "",
        authProvider: user.authProvider || "password",
        emailVerified: user.emailVerified === true,
        profilePic: user.profilePic || "",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase().replace(/^@+/, "");
}

function setTokenCookie(res, userId) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: MAX_AGE,
    });
}

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
    const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error("OTP hash secret is not configured");
    return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

function isDisposableEmail(email) {
    return disposableEmailDomains.has(email.split("@").pop());
}

async function issueOtp(pending, isResend = false) {
    const now = Date.now();
    const lastSentAt = pending.lastSentAt?.getTime() || 0;
    if (isResend && now - lastSentAt < OTP_RESEND_COOLDOWN) {
        return { cooldown: Math.ceil((OTP_RESEND_COOLDOWN - (now - lastSentAt)) / 1000) };
    }
    if (isResend && pending.resendCount >= OTP_MAX_RESENDS) return { rateLimited: true };

    const wasNewPending = pending.isNew;
    const previousOtpHash = pending.otpHash;
    const previousOtpExpiresAt = pending.otpExpiresAt;
    const previousAttempts = pending.attempts;
    const previousLastSentAt = pending.lastSentAt;
    const previousResendCount = pending.resendCount;
    const otp = createOtp();
    pending.otpHash = hashOtp(otp);
    pending.otpExpiresAt = new Date(now + OTP_TTL);
    pending.attempts = 0;
    pending.lastSentAt = new Date(now);
    if (isResend) pending.resendCount += 1;
    await pending.save();
    try {
        await sendEmailVerificationCode(pending.email, otp);
    } catch (error) {
        if (wasNewPending) {
            await PendingEmailVerification.deleteOne({ _id: pending._id });
            throw error;
        }
        pending.otpHash = previousOtpHash;
        pending.otpExpiresAt = previousOtpExpiresAt;
        pending.attempts = previousAttempts;
        pending.lastSentAt = previousLastSentAt;
        pending.resendCount = previousResendCount;
        await pending.save();
        throw error;
    }
    return {};
}

export async function signup(req, res) {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const fullName = String(req.body.fullName || "").trim();
        const username = normalizeUsername(req.body.username);
        const password = String(req.body.password || "");

        if (!email || !fullName || !username || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email address." });
        }

        if (isDisposableEmail(email)) {
            return res.status(400).json({
                message: "Enter a valid email address.",
            });
        }

        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            return res.status(400).json({
                message: "Username must be 3-24 characters and use letters, numbers, or underscores.",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const [existingUser, pendingUsername] = await Promise.all([
            User.findOne({ $or: [{ email }, { username }] }).select("_id email username"),
            PendingEmailVerification.findOne({ username, email: { $ne: email } }).select("_id"),
        ]);

        if (pendingUsername) {
            return res.status(409).json({ message: "Username is already taken" });
        }

        if (existingUser?.email === email) {
            return res.status(409).json({ message: "Email is already registered" });
        }

        if (existingUser?.username === username) {
            return res.status(409).json({ message: "Username is already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const existingPending = await PendingEmailVerification.findOne({ email });
        const pending = existingPending || new PendingEmailVerification({ email });
        pending.fullName = fullName;
        pending.username = username;
        pending.passwordHash = hashedPassword;
        const otpResult = await issueOtp(pending, Boolean(existingPending));
        if (otpResult.cooldown) {
            return res.status(202).json({
                requiresVerification: true,
                email,
                resendAvailableIn: otpResult.cooldown,
            });
        }
        return res.status(202).json({ requiresVerification: true, email });
    } catch (error) {
        console.log("Error in signup:", error.message);
        if (error.code === 11000) {
            return res.status(409).json({ message: "Email or username is already registered" });
        }
        const status = error.statusCode ? 503 : 500;
        res.status(status).json({ message: "Unable to send verification email right now. Please try again shortly." });
    }
}

export async function verifyEmailOtp(req, res) {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const otp = String(req.body.otp || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ message: "Enter a valid 6-digit verification code." });
        }

        const pending = await PendingEmailVerification.findOne({ email });
        if (!pending) return res.status(400).json({ message: "Verification code has expired. Please request a new code." });
        if (pending.attempts >= OTP_MAX_ATTEMPTS) {
            return res.status(429).json({ message: "Too many verification attempts. Please request a new code." });
        }
        if (pending.otpExpiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: "Verification code has expired. Please request a new code." });
        }

        pending.attempts += 1;
        const expectedHash = Buffer.from(pending.otpHash, "hex");
        const receivedHash = Buffer.from(hashOtp(otp), "hex");
        const matches = expectedHash.length === receivedHash.length && crypto.timingSafeEqual(expectedHash, receivedHash);
        if (!matches) {
            await pending.save();
            return res.status(400).json({ message: "Incorrect verification code." });
        }

        const user = await User.create({
            email: pending.email,
            fullName: pending.fullName,
            username: pending.username,
            password: pending.passwordHash,
            emailVerified: true,
        });
        await PendingEmailVerification.deleteOne({ _id: pending._id });
        setTokenCookie(res, user._id);
        return res.status(201).json(serializeUser(user));
    } catch (error) {
        console.log("Error in email verification:", error.message);
        if (error.code === 11000) {
            return res.status(409).json({ message: "Email or username is already registered" });
        }
        return res.status(500).json({ message: "Unable to verify email. Please try again." });
    }
}

export async function resendEmailOtp(req, res) {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const pending = await PendingEmailVerification.findOne({ email });
        if (!pending) return res.status(400).json({ message: "No pending email verification was found." });

        const result = await issueOtp(pending, true);
        if (result.cooldown) {
            return res.status(429).json({ message: `Please wait ${result.cooldown} seconds before requesting another code.` });
        }
        if (result.rateLimited) {
            return res.status(429).json({ message: "Too many verification codes requested. Please try again later." });
        }
        return res.status(200).json({ message: "Verification code sent" });
    } catch (error) {
        console.log("Error resending email verification:", error.message);
        return res.status(503).json({ message: "Unable to send verification email right now. Please try again shortly." });
    }
}

export async function login(req, res) {
    try {
        const identifier = String(req.body.identifier || req.body.email || "").trim().toLowerCase().replace(/^@+/, "");
        const password = String(req.body.password || "");

        if (!identifier || !password) {
            return res.status(400).json({ message: "Email/username and password are required" });
        }

        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }],
        }).select("+password");

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        setTokenCookie(res, user._id);

        res.status(200).json(serializeUser(user));
    } catch (error) {
        console.log("Error in login:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function logout(req, res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
    });
    res.status(200).json({ message: "Logged out" });
}

export async function checkAuth(req, res) {
    if(!req.user){
        return res.status(401).json({message: "Unauthorized"})
    }

    res.status(200).json(serializeUser(req.user))
}
