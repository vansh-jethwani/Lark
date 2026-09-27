import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import dotenv from "dotenv";
dotenv.config();

export default async function protectRoute(req, res, next){
    try{
       const token = req.cookies?.jwt;

       if(!token){
        return res.status(401).json({message: "Unauthorized"})
       }

       if (!process.env.JWT_SECRET) return res.status(500).json({ message: "Authentication is unavailable" });

       const decoded = jwt.verify(token, process.env.JWT_SECRET);
       const user = await User.findById(decoded.userId)
       if(!user){
        return res.status(401).json({message: "Unauthorized"})
       }

       // Tokens minted before tokenVersion existed carry no version and are
       // rejected outright: a stolen legacy token must not survive a password
       // change. Everyone signs in again once after this ships.
       if (
        typeof decoded.tokenVersion !== "number" ||
        user.tokenVersion !== decoded.tokenVersion
       ){
        return res.status(401).json({message: "Unauthorized"})
       }

       // Per-session revocation (Settings → Active sessions). Tokens issued
       // before sessions existed carry no sessionId and are rejected with the
       // legacy tokens above.
       if (!decoded.sessionId) {
        return res.status(401).json({message: "Unauthorized"})
       }
       const session = await Session.findById(decoded.sessionId).select("_id userId revoked lastSeenAt");
       if (!session || session.revoked || String(session.userId) !== String(user._id)) {
        return res.status(401).json({message: "Unauthorized"})
       }
       // Throttled "last seen" touch so the sessions list stays fresh without
       // a write on every single request.
       if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 15 * 60 * 1000) {
        session.lastSeenAt = new Date();
        session.save().catch(() => {});
       }
       req.sessionId = session._id;

       req.user = user
       req.userId = user._id
       next()
    }catch(error){
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "CastError") {
            return res.status(401).json({message: "Unauthorized"});
        }
        console.error("Authentication middleware failed");
        return res.status(500).json({message: "Internal server error"})
    }
}
