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

       if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: "JWT_SECRET is not configured" });
       }

       const decoded = jwt.verify(token, process.env.JWT_SECRET);
       const user = await User.findById(decoded.userId)
       if(!user){
        return res.status(404).json({message: "User not found"})
       }

       req.user = user
       req.userId = user._id
       next()
    }catch(error){
        console.error("Error in auth.middleware:", error.message);
        return res.status(500).json({message: "Internal server error"})
    }
}
