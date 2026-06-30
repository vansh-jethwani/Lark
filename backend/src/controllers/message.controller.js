import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

const MESSAGE_POPULATE = "text image video audio file fileName senderId";

function isMessageParticipant(message, userId) {
    return (
        message.senderId.toString() === userId.toString() ||
        message.receiverId.toString() === userId.toString()
    );
}

async function populateReply(messageId) {
    return Message.findById(messageId).populate("replyTo", MESSAGE_POPULATE);
}

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
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId },
            ],
            deletedFor: { $nin: [senderId] },
        })
            .populate("replyTo", MESSAGE_POPULATE)
            .sort({ createdAt: 1 });

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
    if (senderSocketIds.length > 0) {
        io.to(senderSocketIds).emit("messagesRead", {
            conversationId: String(readerId),
            readerId: String(readerId),
            messageIds,
            readAt,
        });
    }

    const readerSocketIds = getReceiverSocketId(readerId);
    if (readerSocketIds.length > 0) {
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
        const { text, replyTo } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.userId;
        const mediaFile = req.file || req.files?.media?.[0];

        let imageUrl;
        let videoUrl;
        let audioUrl;
        let fileUrl;
        let fileName;
        let fileType;
        let fileSize;

        if (mediaFile) {
            if (!hasImagekitConfig()) {
                return res.status(503).json({ message: "Media upload is not configured." })
            }

            const url = await uploadChatMedia(mediaFile);
            fileName = mediaFile.originalname;
            fileType = mediaFile.mimetype;
            fileSize = mediaFile.size;

            if (mediaFile.mimetype.startsWith("image")) {
                imageUrl = url;
            }
            else if (mediaFile.mimetype.startsWith("video")) {
                videoUrl = url;
            }
            else if (mediaFile.mimetype.startsWith("audio")) {
                audioUrl = url;
            }
            else {
                fileUrl = url;
            }
        }

        if (!text?.trim() && !mediaFile) {
            return res.status(400).json({ message: "Message text or media is required." });
        }

        const receiverSocketId = getReceiverSocketId(receiverId);
        const deliveredAt = receiverSocketId.length > 0 ? new Date() : null;

        const newMessage = new Message({
            senderId,
            receiverId,
            text: text || "",
            image: imageUrl || "",
            video: videoUrl || "",
            audio: audioUrl || "",
            file: fileUrl || "",
            fileName: fileName || "",
            fileType: fileType || "",
            fileSize: fileSize || 0,
            deliveredAt,
            replyTo: replyTo || null,
        });

        await newMessage.save();
        const populatedMessage = await populateReply(newMessage._id);

        const senderSocketId = getReceiverSocketId(senderId);
        const messageSocketIds = [...new Set([...receiverSocketId, ...senderSocketId])];

        if (messageSocketIds.length > 0) {
            io.to(messageSocketIds).emit("newMessage", populatedMessage);
        }

        res.status(201).json(populatedMessage);

    } catch (error) {
        console.log("Error in sendMessage: ", error.message);
        res.status(500).json({ message: error.message || "Failed to upload media." });
    }
}

export async function togglePinMessage(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (!isMessageParticipant(message, userId)) {
            return res.status(403).json({ message: "Not allowed" });
        }

        message.isPinned = !message.isPinned;
        message.pinnedAt = message.isPinned ? new Date() : null;
        message.pinnedBy = message.isPinned ? userId : null;

        await message.save();

        const populatedMessage = await populateReply(message._id);
        const senderSocketIds = getReceiverSocketId(message.senderId.toString());
        const receiverSocketIds = getReceiverSocketId(message.receiverId.toString());
        const socketIds = [...new Set([...senderSocketIds, ...receiverSocketIds])];

        if (socketIds.length > 0) {
            io.to(socketIds).emit("messagePinned", populatedMessage);
        }

        res.status(200).json(populatedMessage);
    } catch (error) {
        console.log("Error in togglePinMessage: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function forwardMessage(req, res) {
    try {
        const { id } = req.params;
        const { receiverId, receiverIds } = req.body;
        const senderId = req.userId;
        const targetReceiverIds = [
            ...new Set(
                (Array.isArray(receiverIds) ? receiverIds : [receiverId])
                    .filter(Boolean)
                    .map((value) => value.toString())
            ),
        ];

        if (targetReceiverIds.length === 0) {
            return res.status(400).json({ message: "Forward recipient is required." });
        }

        if (targetReceiverIds.some((targetId) => targetId === senderId.toString())) {
            return res.status(400).json({ message: "You cannot forward a message to yourself." });
        }

        const originalMessage = await Message.findById(id);

        if (!originalMessage) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (!isMessageParticipant(originalMessage, senderId)) {
            return res.status(403).json({ message: "Not allowed" });
        }

        const receivers = await User.find({ _id: { $in: targetReceiverIds } }).select("_id");

        if (receivers.length !== targetReceiverIds.length) {
            return res.status(404).json({ message: "One or more recipients were not found" });
        }

        const forwardedMessages = [];

        for (const targetReceiverId of targetReceiverIds) {
            const receiverSocketIds = getReceiverSocketId(targetReceiverId);
            const deliveredAt = receiverSocketIds.length > 0 ? new Date() : null;

            const forwardedMessage = new Message({
                senderId,
                receiverId: targetReceiverId,
                text: originalMessage.text || "",
                image: originalMessage.image || "",
                video: originalMessage.video || "",
                audio: originalMessage.audio || "",
                file: originalMessage.file || "",
                fileName: originalMessage.fileName || "",
                fileType: originalMessage.fileType || "",
                fileSize: originalMessage.fileSize || 0,
                deliveredAt,
                forwardedFrom: originalMessage._id,
                isForwarded: true,
            });

            await forwardedMessage.save();

            const populatedMessage = await populateReply(forwardedMessage._id);
            const senderSocketIds = getReceiverSocketId(senderId);
            const socketIds = [...new Set([...receiverSocketIds, ...senderSocketIds])];

            if (socketIds.length > 0) {
                io.to(socketIds).emit("newMessage", populatedMessage);
            }

            forwardedMessages.push(populatedMessage);
        }

        res.status(201).json({ messages: forwardedMessages });
    } catch (error) {
        console.log("Error in forwardMessage: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const editMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        const myId = req.userId;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Message text is required" });
        }

        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (message.senderId.toString() !== myId.toString()) {
            return res.status(403).json({ message: "You can edit only your own message" });
        }

        message.text = text.trim();
        message.isEdited = true;

        await message.save();
        const populatedMessage = await populateReply(message._id);

        const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
        const senderSocketId = getReceiverSocketId(message.senderId.toString());

        if (receiverSocketId) {
            io.to(receiverSocketId).emit("messageEdited", populatedMessage);
        }

        if (senderSocketId) {
            io.to(senderSocketId).emit("messageEdited", populatedMessage);
        }

        res.status(200).json(populatedMessage);
    } catch (error) {
        console.log("Error in editMessage controller:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const toggleReaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { emoji } = req.body;
        const userId = req.userId;

        if (!emoji || typeof emoji !== "string") {
            return res.status(400).json({ message: "Reaction emoji is required" });
        }

        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (!isMessageParticipant(message, userId)) {
            return res.status(403).json({ message: "Not allowed" });
        }

        const existingReactionIndex = message.reactions.findIndex(
            (reaction) => reaction.userId.toString() === userId.toString()
        );

        if (existingReactionIndex >= 0 && message.reactions[existingReactionIndex].emoji === emoji) {
            message.reactions.splice(existingReactionIndex, 1);
        } else if (existingReactionIndex >= 0) {
            message.reactions[existingReactionIndex].emoji = emoji;
        } else {
            message.reactions.push({ userId, emoji });
        }

        await message.save();

        const populatedMessage = await populateReply(message._id);
        const senderSocketIds = getReceiverSocketId(message.senderId.toString());
        const receiverSocketIds = getReceiverSocketId(message.receiverId.toString());
        const socketIds = [...new Set([...senderSocketIds, ...receiverSocketIds])];

        if (socketIds.length > 0) {
            io.to(socketIds).emit("messageReaction", populatedMessage);
        }

        res.status(200).json(populatedMessage);
    } catch (error) {
        console.log("Error in toggleReaction:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; // "me" or "everyone"
        const myId = req.userId;

        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        const isSender = message.senderId.toString() === myId.toString();
        const isReceiver = message.receiverId.toString() === myId.toString();

        if (!isSender && !isReceiver) {
            return res.status(403).json({ message: "Not allowed" });
        }

        if (type === "everyone") {
            if (!isSender) {
                return res.status(403).json({
                    message: "Only sender can delete for everyone",
                });
            }

            await Message.findByIdAndDelete(id);

            const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
            const senderSocketId = getReceiverSocketId(message.senderId.toString());

            if (receiverSocketId) io.to(receiverSocketId).emit("messageDeleted", id);
            if (senderSocketId) io.to(senderSocketId).emit("messageDeleted", id);

            return res.status(200).json({
                messageId: id,
                type: "everyone",
            });
        }

        const deletedFor = message.deletedFor || [];

        const alreadyDeleted = deletedFor.some(
            (userId) => userId.toString() === myId.toString()
        );

        if (!alreadyDeleted) {
            message.deletedFor.push(myId);
            await message.save();
        } await message.save();

        const senderSocketId = getReceiverSocketId(myId.toString());

        if (senderSocketId) {
            io.to(senderSocketId).emit("messageDeletedForMe", id);
        }

        res.status(200).json({
            messageId: id,
            type: "me",
        });
    } catch (error) {
        console.log("Error in deleteMessage:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};
