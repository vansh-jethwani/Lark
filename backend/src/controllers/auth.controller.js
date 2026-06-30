import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const COOKIE_NAME = "jwt";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function serializeUser(user) {
    return {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        bio: user.bio || "",
        phoneNumber: user.phoneNumber || "",
        authProvider: user.authProvider || "password",
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
            return res.status(400).json({ message: "Enter a valid email address" });
        }

        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            return res.status(400).json({
                message: "Username must be 3-24 characters and use letters, numbers, or underscores.",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        }).select("_id email username");

        if (existingUser?.email === email) {
            return res.status(409).json({ message: "Email is already registered" });
        }

        if (existingUser?.username === username) {
            return res.status(409).json({ message: "Username is already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            email,
            fullName,
            username,
            password: hashedPassword,
            authProvider: "password",
        });

        setTokenCookie(res, user._id);

        res.status(201).json(serializeUser(user));
    } catch (error) {
        console.log("Error in signup:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function login(req, res) {
    try {
        const identifier = String(req.body.identifier || req.body.email || "").trim().toLowerCase();
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
