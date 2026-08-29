import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
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
