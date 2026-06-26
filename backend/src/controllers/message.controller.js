import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export async function getUsersForSidebar(req, res) {
    try {
        const loggedInUser = req.userId;

        const filteredUsers = await User.find({
            _id: { $ne: loggedInUser },
        }).select("-password -clerkId -__v");

        res.status(200).json(filteredUsers);
    } catch (error) {
        console.log("Error in getUsersForSidebar: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function getConversationsForSidebar(req, res) {
    try {
        const loggedInUser = req.userId;

        const conversations = await Message.aggregate([
            // 1. Keep only the messages I sent or received.
            { $match: { $or: [{ senderId: loggedInUser }, { receiverId: loggedInUser }] } },
            // 2. Collapse them into one row per chat partner, noting our latest message time.
            {
                $group: {
                    // The partner is the other person on the message (not me).
                    _id: { $cond: [{ $eq: ["$senderId", loggedInUser] }, "$receiverId", "$senderId"] },
                    lastMessageAt: { $max: "$createdAt" },
                },
            },
            // 3. Put the most recent conversation at the top.
            { $sort: { lastMessageAt: -1 } },
            // 4. Look up each partner's user profile (comes back as an array).
            { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
            // 5. Pull that profile out of the array and make it the document.
            { $replaceRoot: { newRoot: { $first: "$user" } } },
            // 6. Hide the private clerkId field from the result.
            { $project: { clerkId: 0 } },

        ])

        res.status(200).json(conversations);

    } catch (error) {
        console.log("Error in getConversationsForSidebar: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function getMessages(req, res) {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.userId;

        const messages = await Message.find({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId },
            ],
        }).sort({ createdAt: 1 });

        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function sendMessage(req, res) {
    try {
        const { text } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.userId;

        let imageUrl;
        let videoUrl;

        if(req.file){
            if(!hasImagekitConfig()){
                return res.status(503).json({error: "Media upload not configured"})
            }

            const url = await uploadChatMedia(req.file);

            if(req.file.mimetype.startsWith("image")){
                imageUrl = url;
            }
            else{
                videoUrl = url;
            }            
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imageUrl || "",
            video: videoUrl || "",
        });

        await newMessage.save();

        const receiverSocketId = getReceiverSocketId(receiverId);
        // only send the message in realtime if user is online
        if(receiverSocketId){
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);

    } catch (error) {
        console.log("Error in sendMessage: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}