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
            { $match: { $or: [{ senderId: loggedInUser }, { receiverId: loggedInUser }] } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: { $cond: [{ $eq: ["$senderId", loggedInUser] }, "$receiverId", "$senderId"] },
                    lastMessage: { $first: "$$ROOT" },
                    lastMessageAt: { $first: "$createdAt" },
                },
            },
            { $sort: { lastMessageAt: -1 } },
            { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
            { $unwind: "$user" },
            {
                $lookup: {
                    from: "messages",
                    let: { partnerId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$senderId", "$$partnerId"] },
                                        { $eq: ["$receiverId", loggedInUser] },
                                        { $eq: ["$readAt", null] },
                                    ],
                                },
                            },
                        },
                        { $count: "count" },
                    ],
                    as: "unread",
                },
            },
            {
                $addFields: {
                    unreadCount: { $ifNull: [{ $first: "$unread.count" }, 0] },
                },
            },
            {
                $replaceRoot: {
                    newRoot: {
                        $mergeObjects: [
                            "$user",
                            {
                                unreadCount: "$unreadCount",
                                lastMessage: "$lastMessage",
                                lastMessageAt: "$lastMessageAt",
                            },
                        ],
                    },
                },
            },
            { $project: { clerkId: 0, unread: 0 } },

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

        await markUnreadMessagesAsRead(senderId, receiverId);

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

async function markUnreadMessagesAsRead(readerId, conversationPartnerId) {
    const unreadMessages = await Message.find({
        senderId: conversationPartnerId,
        receiverId: readerId,
        readAt: null,
    }).select("_id");

    if (unreadMessages.length === 0) return [];

    const readAt = new Date();
    const messageIds = unreadMessages.map((message) => message._id);

    await Message.updateMany(
        { _id: { $in: messageIds } },
        { $set: { readAt, deliveredAt: readAt } },
    );

    const senderSocketIds = getReceiverSocketId(conversationPartnerId);
    if(senderSocketIds.length > 0){
        io.to(senderSocketIds).emit("messagesRead", {
            conversationId: String(readerId),
            readerId: String(readerId),
            messageIds,
            readAt,
        });
    }

    const readerSocketIds = getReceiverSocketId(readerId);
    if(readerSocketIds.length > 0){
        io.to(readerSocketIds).emit("conversationRead", {
            conversationId: String(conversationPartnerId),
            readAt,
        });
    }

    return messageIds;
}

export async function markConversationAsRead(req, res) {
    try {
        const { id: conversationPartnerId } = req.params;
        const readerId = req.userId;

        const messageIds = await markUnreadMessagesAsRead(readerId, conversationPartnerId);

        res.status(200).json({ messageIds });
    } catch (error) {
        console.log("Error in markConversationAsRead: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function sendMessage(req, res) {
    try {
        const { text } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.userId;
        const mediaFile = req.file || req.files?.media?.[0];

        let imageUrl;
        let videoUrl;
        let fileUrl;
        let fileName;
        let fileType;
        let fileSize;

        if(mediaFile){
            if(!hasImagekitConfig()){
                return res.status(503).json({message: "Media upload is not configured."})
            }

            const url = await uploadChatMedia(mediaFile);
            fileName = mediaFile.originalname;
            fileType = mediaFile.mimetype;
            fileSize = mediaFile.size;

            if(mediaFile.mimetype.startsWith("image")){
                imageUrl = url;
            }
            else if(mediaFile.mimetype.startsWith("video")){
                videoUrl = url;
            }
            else{
                fileUrl = url;
            }
        }

        if(!text?.trim() && !mediaFile){
            return res.status(400).json({message: "Message text or media is required."});
        }

        const receiverSocketId = getReceiverSocketId(receiverId);
        const deliveredAt = receiverSocketId.length > 0 ? new Date() : null;

        const newMessage = new Message({
            senderId,
            receiverId,
            text: text || "",
            image: imageUrl || "",
            video: videoUrl || "",
            file: fileUrl || "",
            fileName: fileName || "",
            fileType: fileType || "",
            fileSize: fileSize || 0,
            deliveredAt,
        });

        await newMessage.save();

        const senderSocketId = getReceiverSocketId(senderId);
        const messageSocketIds = [...new Set([...receiverSocketId, ...senderSocketId])];

        if(messageSocketIds.length > 0){
            io.to(messageSocketIds).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);

    } catch (error) {
        console.log("Error in sendMessage: ", error.message);
        res.status(500).json({ message: error.message || "Failed to upload media." });
    }
}
