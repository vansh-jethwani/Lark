import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createRequire } from "module";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import PendingEmailVerification from "../models/pendingEmailVerification.model.js";
import PasswordResetOtp from "../models/passwordResetOtp.model.js";
import Session from "../models/session.model.js";
import { sendEmailVerificationCode } from "../lib/email.js";
import { disconnectSessionSockets } from "../lib/socket.js";
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
        publicKey: user.publicKey || "",
        privacy: {
            profilePhoto: user.privacy?.profilePhoto || "everyone",
            readReceipts: user.privacy?.readReceipts !== false,
        },
        notificationPrefs: {
            messageSound: user.notificationPrefs?.messageSound !== false,
            pushEnabled: user.notificationPrefs?.pushEnabled !== false,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase().replace(/^@+/, "");
}

function cookieOptions() {
    // Same-origin Render deployment: "lax" is sufficient and strictly safer
    // than "none" (which also requires Secure and widens CSRF surface).
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: MAX_AGE,
    };
}

// Clearing must NOT include maxAge: when both Expires and Max-Age are set,
// browsers honor Max-Age, which would keep the cookie alive instead of
// deleting it. Express sets Expires to a past date for us.
function clearCookieOptions() {
    const { maxAge: _ignored, ...rest } = cookieOptions();
    return rest;
}

// Shared with profile.controller: changing your password re-issues the
// current device's token instead of signing it out too.
export async function setTokenCookie(req, res, userId, tokenVersion = 0) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }

    // One Session row per login: powers Settings → Active sessions and
    // per-device revocation. The JWT stays stateless; the middleware rejects
    // tokens whose session row is missing or revoked.
    const session = await Session.create({
        userId,
        userAgent: String(req.headers?.["user-agent"] || "").slice(0, 300),
        ip: String(req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "").slice(0, 80),
    });

    const token = jwt.sign({ userId, tokenVersion, sessionId: String(session._id) }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });

    res.cookie(COOKIE_NAME, token, cookieOptions());
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
            await pending.constructor.deleteOne({ _id: pending._id });
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

        const { publicKey: initPubKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
        const initPubKeyBase64 = initPubKey.export({ type: "spki", format: "der" }).toString("base64");

        const user = await User.create({
            email: pending.email,
            fullName: pending.fullName,
            username: pending.username,
            password: pending.passwordHash,
            emailVerified: true,
            publicKey: initPubKeyBase64,
        });
        await PendingEmailVerification.deleteOne({ _id: pending._id });
        await setTokenCookie(req, res, user._id, user.tokenVersion);
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

        await setTokenCookie(req, res, user._id, user.tokenVersion);

        res.status(200).json(serializeUser(user));
    } catch (error) {
        console.log("Error in login:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function logout(req, res) {
    try {
        // Best-effort: revoke this device's session row so the token dies
        // server-side too, not just in the browser cookie jar.
        const token = req.cookies?.jwt;
        if (token && process.env.JWT_SECRET) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded?.sessionId) {
                await Session.updateOne(
                    { _id: decoded.sessionId, userId: decoded.userId },
                    { $set: { revoked: true } }
                );
            }
        }
    } catch {
        /* logging out must never fail because of session bookkeeping */
    }
    res.clearCookie(COOKIE_NAME, clearCookieOptions());
    res.status(200).json({ message: "Logged out" });
}

export async function checkAuth(req, res) {
    if(!req.user){
        return res.status(401).json({message: "Unauthorized"})
    }

    res.status(200).json(serializeUser(req.user))
}

function presentSession(session, currentSessionId) {
    return {
        _id: session._id,
        userAgent: session.userAgent || "",
        ip: session.ip || "",
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        isCurrent: String(session._id) === String(currentSessionId),
    };
}

// Every device currently signed in to this account.
export async function getSessions(req, res) {
    try {
        const sessions = await Session.find({ userId: req.userId, revoked: false })
            .sort({ updatedAt: -1 })
            .lean();
        res.status(200).json(sessions.map((s) => presentSession(s, req.sessionId)));
    } catch (error) {
        console.log("Error in getSessions:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

// Revoke one session (a single device). You cannot revoke the session you are
// using — use logout for that.
export async function revokeSession(req, res) {
    try {
        const { id } = req.params;
        if (String(id) === String(req.sessionId)) {
            return res.status(400).json({ message: "You cannot revoke your current session. Use logout instead." });
        }
        const result = await Session.updateOne(
            { _id: id, userId: req.userId, revoked: false },
            { $set: { revoked: true } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Session not found." });
        }
        // Kick that device's live sockets immediately; its JWT is already dead.
        disconnectSessionSockets(id);
        res.status(200).json({ message: "Session revoked." });
    } catch (error) {
        console.log("Error in revokeSession:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

// "Log out all other devices": revoke every session except the current one.
// (Changing your password additionally bumps tokenVersion, which kills even
// the current session everywhere else.)
export async function revokeOtherSessions(req, res) {
    try {
        const others = await Session.find(
            { userId: req.userId, revoked: false, _id: { $ne: req.sessionId } },
            { _id: 1 }
        ).lean();
        const result = await Session.updateMany(
            { userId: req.userId, revoked: false, _id: { $ne: req.sessionId } },
            { $set: { revoked: true } }
        );
        // Kick every other device's live sockets immediately.
        for (const s of others) disconnectSessionSockets(s._id);
        res.status(200).json({ message: "Other sessions revoked.", count: result.modifiedCount });
    } catch (error) {
        console.log("Error in revokeOtherSessions:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}


export async function forgotPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'Email is required' });
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ message: 'If an account exists, an OTP will be sent' });
        }
        
        let pending = await PasswordResetOtp.findOne({ email });
        if (!pending) pending = new PasswordResetOtp({ email });
        
        const result = await issueOtp(pending, Boolean(pending.lastSentAt));
        if (result.cooldown) {
            return res.status(429).json({ message: `Please wait ${result.cooldown} seconds before requesting another code.` });
        }
        if (result.rateLimited) {
            return res.status(429).json({ message: 'Too many verification codes requested. Please try again later.' });
        }
        
        return res.status(200).json({ message: 'If an account exists, an OTP will be sent' });
    } catch (error) {
        console.log('Error in forgotPassword:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function verifyResetOtp(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const otp = String(req.body.otp || '').trim();
        
        const pending = await PasswordResetOtp.findOne({ email });
        if (!pending) return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        
        if (pending.attempts >= OTP_MAX_ATTEMPTS) {
            return res.status(429).json({ message: 'Too many verification attempts. Please request a new code.' });
        }
        if (pending.otpExpiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        }
        
        pending.attempts += 1;
        const expectedHash = Buffer.from(pending.otpHash, 'hex');
        const receivedHash = Buffer.from(hashOtp(otp), 'hex');
        const matches = expectedHash.length === receivedHash.length && crypto.timingSafeEqual(expectedHash, receivedHash);
        
        if (!matches) {
            await pending.save();
            return res.status(400).json({ message: 'Incorrect verification code.' });
        }
        
        pending.verified = true;
        await pending.save();
        
        return res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.log('Error in verifyResetOtp:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function resetPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        
        const pending = await PasswordResetOtp.findOne({ email, verified: true });
        if (!pending || pending.otpExpiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: 'Session expired. Please request a new code.' });
        }
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        user.password = await bcrypt.hash(password, 12);
        // Revoke every other session: JWTs embed tokenVersion, so bumping it
        // invalidates tokens issued before this reset.
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        // Keep the sessions list honest: those rows are dead now.
        await Session.updateMany({ userId: user._id }, { $set: { revoked: true } });

        await PasswordResetOtp.deleteOne({ _id: pending._id });

        res.clearCookie(COOKIE_NAME, clearCookieOptions());
        
        return res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        console.log('Error in resetPassword:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function updatePublicKey(req, res) {
    try {
        const { publicKey } = req.body;
        // P-256 SPKI keys are base64; bound the shape so arbitrary blobs can't
        // be published for other clients to fetch and import.
        if (
            typeof publicKey !== "string" ||
            publicKey.length < 1 ||
            publicKey.length > 2000 ||
            !/^[A-Za-z0-9+/=_-]+$/.test(publicKey)
        ) {
            return res.status(400).json({ message: "Invalid public key." });
        }

        await User.findByIdAndUpdate(req.userId, { publicKey });
        return res.status(200).json({ message: "Public key updated" });
    } catch (error) {
        console.log('Error in updatePublicKey:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getPublicKey(req, res) {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.publicKey) {
            const { publicKey: genKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
            user.publicKey = genKey.export({ type: "spki", format: "der" }).toString("base64");
            await user.save();
        }
        return res.status(200).json({ publicKey: user.publicKey });
    } catch (error) {
        console.log('Error in getPublicKey:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
