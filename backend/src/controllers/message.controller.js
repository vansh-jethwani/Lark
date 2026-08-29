import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { presentMessageMedia, presentMessagesMedia } from "../lib/media.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendMessageNotification } from "../lib/notifications.js";

const MESSAGE_POPULATE = "text image video audio file fileName senderId";
const DEFAULT_MESSAGE_PAGE_SIZE = 40;

function getPageOptions(req) {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_MESSAGE_PAGE_SIZE, 1), 100);
    if (!req.query.before) return { limit, before: null };
    try {
        const cursor = JSON.parse(Buffer.from(req.query.before, "base64url").toString("utf8"));
        if (!cursor.createdAt || !cursor.id) return { limit, before: null };
        return { limit, before: { createdAt: new Date(cursor.createdAt), id: cursor.id } };
    } catch { return { limit, before: null }; }
}

function makeCursor(message) {
    if (!message) return null;
    return Buffer.from(JSON.stringify({ createdAt: message.createdAt, id: message._id })).toString("base64url");
}

async function isMessageParticipant(message, userId) {
    if (message.groupId) {
        return Boolean(await Group.exists({ _id: message.groupId, members: userId }));
    }
    return (
        message.senderId.toString() === userId.toString() ||
        message.receiverId.toString() === userId.toString()
    );
}

async function getMessageSocketIds(message) {
    if (message.groupId) {
        const group = await Group.findById(message.groupId).select("members");
        return [...new Set((group?.members || []).flatMap((member) => getReceiverSocketId(member)))];
    }
    return [...new Set([...getReceiverSocketId(message.senderId), ...getReceiverSocketId(message.receiverId)])];
}

async function populateReply(messageId) {
    return Message.findById(messageId).populate("replyTo", MESSAGE_POPULATE);
}

function presentMessage(message) {
    return presentMessageMedia(message);
}

export async function getSharedMedia(req, res) {
    try {
        const userId = req.userId;
        const peerId = req.params.id;
        const messages = await Message.find({
            $and: [
                { $or: [{ senderId: userId, receiverId: peerId }, { senderId: peerId, receiverId: userId }] },
                { $or: [{ image: { $ne: "" } }, { video: { $ne: "" } }, { audio: { $ne: "" } }, { file: { $ne: "" } }] },
            ],
            deletedFor: { $nin: [userId] },
        }).select("image video audio file fileName fileType fileSize senderId createdAt").sort({ createdAt: -1 }).limit(60);
        res.json(presentMessagesMedia(messages));
    } catch (error) { res.status(500).json({ message: "Internal server error" }); }
}

export async function getFreshMediaUrl(req, res) {
    try {
        const message = await Message.findById(req.params.id);
        const type = req.params.type;
        if (!message || !["image", "video", "audio", "file"].includes(type)) {
            return res.status(404).json({ message: "Media not found." });
        }
        if (!(await isMessageParticipant(message, req.userId))) {
            return res.status(403).json({ message: "Not allowed." });
        }
        const presented = presentMessage(message);
        const url = type === "image" ? presented.imageOriginal || presented.image : presented[type];
        if (!url) return res.status(404).json({ message: "Media not found." });
        return res.json({ url, thumbnailUrl: type === "image" ? presented.imageThumbnail : type === "video" ? presented.videoThumbnail : undefined });
    } catch (error) {
        return res.status(500).json({ message: "Unable to refresh media." });
    }
}

export async function uploadMedia(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: "A file is required." });
        if (!hasImagekitConfig()) return res.status(503).json({ message: "Media upload is not configured." });
        const { filePath } = await uploadChatMedia(req.file);
        // This endpoint is also used for group artwork. It returns a temporary
        // URL for immediate preview plus the path that callers persist.
        res.status(201).json({
            url: presentMessageMedia({ image: filePath }).image,
            filePath,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
        });
    } catch (error) { res.status(500).json({ message: "Failed to upload media." }); }
}

export async function getUsersForSidebar(req, res) {
    try {
        const loggedInUser = req.userId;
        const query = String(req.query.q || "").trim();

        // Never return the entire user directory
        if (!query) {
            return res.status(200).json([]);
        }

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);

        let filter;

        if (isEmail) {
            // Exact email search
            filter = {
                _id: { $ne: loggedInUser },
                email: query.toLowerCase(),
            };
        } else {
            // Username search
            if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(query)) {
                return res.status(200).json([]);
            }

            const safeQuery = query.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            filter = {
                _id: { $ne: loggedInUser },
                username: {
                    $regex: `^${safeQuery}`,
                    $options: "i",
                },
            };
        }

        const filteredUsers = await User.find(filter)
            .select("_id fullName username profilePic")
            .limit(20)
            .lean();

        res.status(200).json(filteredUsers);
    } catch (error) {
        console.log(
            "Error in getUsersForSidebar: ",
            error.message
        );

        res.status(500).json({
            error: "Internal server error",
        });
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
            {
                $project: {
                    fullName: 1,
                    username: 1,
                    profilePic: 1,
                    unreadCount: 1,
                    lastMessageAt: 1,
                    lastMessage: {
                        _id: "$lastMessage._id",
                        senderId: "$lastMessage.senderId",
                        receiverId: "$lastMessage.receiverId",
                        text: "$lastMessage.text",
                        image: "$lastMessage.image",
                        video: "$lastMessage.video",
                        audio: "$lastMessage.audio",
                        file: "$lastMessage.file",
                        fileName: "$lastMessage.fileName",
                        createdAt: "$lastMessage.createdAt",
                        readAt: "$lastMessage.readAt",
                    },
                },
            },

        ])

        res.status(200).json(conversations.map((conversation) => ({
            ...conversation,
            lastMessage: presentMessage(conversation.lastMessage),
        })));

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

        const filter = {
            $or: [
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId },
            ],
            deletedFor: { $nin: [senderId] },
        };

        // The legacy array response remains available unless a client opts into pagination.
        if (req.query.paginated !== "true") {
            const messages = await Message.find(filter).populate("replyTo", MESSAGE_POPULATE).sort({ createdAt: 1 }).limit(100);
            return res.status(200).json(presentMessagesMedia(messages));
        }

        const { limit, before } = getPageOptions(req);
        if (before) {
            filter.$and = [{
                $or: [
                    { createdAt: { $lt: before.createdAt } },
                    { createdAt: before.createdAt, _id: { $lt: before.id } },
                ]
            }];
        }
        const page = await Message.find(filter).populate("replyTo", MESSAGE_POPULATE)
            .sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
        const hasMore = page.length > limit;
        const messages = (hasMore ? page.slice(0, limit) : page).reverse();

        res.status(200).json({ messages: presentMessagesMedia(messages), hasMore, nextCursor: hasMore ? makeCursor(messages[0]) : null });
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
        const receiver = await User.exists({ _id: receiverId });
        if (!receiver) return res.status(404).json({ message: "User not found." });
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

            const filePath = await uploadChatMedia(mediaFile);
            fileName = mediaFile.originalname;
            fileType = mediaFile.mimetype;
            fileSize = mediaFile.size;

            if (mediaFile.mimetype.startsWith("image")) {
                imageUrl = filePath;
            }
            else if (mediaFile.mimetype.startsWith("video")) {
                videoUrl = filePath;
            }
            else if (mediaFile.mimetype.startsWith("audio")) {
                audioUrl = filePath;
            }
            else {
                fileUrl = filePath;
            }
        }

        if (!text?.trim() && !mediaFile) {
            return res.status(400).json({ message: "Message text or media is required." });
        }

        const receiverSocketId = getReceiverSocketId(receiverId);
        const deliveredAt = receiverSocketId.length > 0 ? new Date() : null;

        let validReplyTo = null;

        if (replyTo) {
            const repliedMessage = await Message.findById(replyTo);

            if (!repliedMessage) {
                return res.status(400).json({
                    message: "Invalid reply message.",
                });
            }

            const canReplyTo = await isMessageParticipant(
                repliedMessage,
                senderId
            );

            if (!canReplyTo) {
                return res.status(403).json({
                    message: "You cannot reply to this message.",
                });
            }

            validReplyTo = repliedMessage._id;
        }

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
            replyTo: validReplyTo,
        });

        await newMessage.save();
        const populatedMessage = await populateReply(newMessage._id);

        const senderSocketId = getReceiverSocketId(senderId);
        const messageSocketIds = [...new Set([...receiverSocketId, ...senderSocketId])];

        if (messageSocketIds.length > 0) {
            io.to(messageSocketIds).emit("newMessage", presentMessage(populatedMessage));
        }

        if (receiverSocketId.length === 0) {
            const sender = await User.findById(senderId).select("fullName profilePic");
            if (sender) sendMessageNotification({ receiverId, sender, message: populatedMessage }).catch((error) => console.error("Message push failed:", error.message));
        }

        res.status(201).json(presentMessage(populatedMessage));

    } catch (error) {
        console.log("Error in sendMessage: ", error.message);
        res.status(500).json({ message: "Failed to send message." });
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

        if (!(await isMessageParticipant(message, userId))) {
            return res.status(403).json({ message: "Not allowed" });
        }

        message.isPinned = !message.isPinned;
        message.pinnedAt = message.isPinned ? new Date() : null;
        message.pinnedBy = message.isPinned ? userId : null;

        await message.save();

        const populatedMessage = await populateReply(message._id);
        const socketIds = await getMessageSocketIds(message);

        if (socketIds.length > 0) {
            io.to(socketIds).emit("messagePinned", populatedMessage);
        }

        res.status(200).json(presentMessage(populatedMessage));
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

        if (!(await isMessageParticipant(originalMessage, senderId))) {
            return res.status(403).json({ message: "Not allowed" });
        }

        const receivers = await User.find({ _id: { $in: targetReceiverIds } }).select("_id");

        if (receivers.length !== targetReceiverIds.length) {
            return res.status(404).json({ message: "One or more recipients were not found" });
        }

        const forwardedMessages = [];
        const senderForNotification = await User.findById(senderId).select("fullName profilePic");

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
            io.to(socketIds).emit("newMessage", presentMessage(populatedMessage));
            }

            if (receiverSocketIds.length === 0 && senderForNotification) {
                sendMessageNotification({ receiverId: targetReceiverId, sender: senderForNotification, message: populatedMessage }).catch((error) => console.error("Forwarded-message push failed:", error.message));
            }

            forwardedMessages.push(presentMessage(populatedMessage));
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

        const socketIds = await getMessageSocketIds(message);
        if (socketIds.length) io.to(socketIds).emit("messageEdited", presentMessage(populatedMessage));

        res.status(200).json(presentMessage(populatedMessage));
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

        if (!(await isMessageParticipant(message, userId))) {
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
        const socketIds = await getMessageSocketIds(message);

        if (socketIds.length > 0) {
            io.to(socketIds).emit("messageReaction", presentMessage(populatedMessage));
        }

        res.status(200).json(presentMessage(populatedMessage));
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
        const isReceiver = message.receiverId && message.receiverId.toString() === myId.toString();

        if (!isSender && !isReceiver && !(await isMessageParticipant(message, myId))) {
            return res.status(403).json({ message: "Not allowed" });
        }

        if (type === "everyone") {
            if (!isSender) {
                return res.status(403).json({
                    message: "Only sender can delete for everyone",
                });
            }

            await Message.findByIdAndDelete(id);

            const socketIds = await getMessageSocketIds(message);
            if (socketIds.length) io.to(socketIds).emit("messageDeleted", id);

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
