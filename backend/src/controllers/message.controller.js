import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import ConversationSetting, { dmSettingKey } from "../models/conversationSetting.model.js";
import { hasImagekitConfig, uploadChatMedia, deleteChatMedia } from "../lib/imagekit.js";
import { presentMessageMedia, presentMessagesMedia } from "../lib/media.js";
import { getReceiverSocketId, io, isUserOnline } from "../lib/socket.js";
import { sendMessageNotification } from "../lib/notifications.js";
import { safeCache } from "../lib/redis.js";
import { applyPhotoPrivacyToList } from "../lib/privacy.js";
import { expiryDateFor, isValidDisappearingDuration, notExpiredFilter } from "../lib/disappearing.js";

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

function readReceiptsEnabled(user) {
    return user?.privacy?.readReceipts !== false;
}

// Expired disappearing messages must never be returned by reads, even if the
// cleanup cron hasn't deleted the documents yet.
function notExpiredClause() {
    return notExpiredFilter();
}

async function dmDisappearingDuration(userIdA, userIdB) {
    const setting = await ConversationSetting.findOne({ key: dmSettingKey(userIdA, userIdB) })
        .select("disappearingDuration")
        .lean();
    return Number(setting?.disappearingDuration) || 0;
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
                { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
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
        if (message.expiresAt && message.expiresAt <= new Date()) {
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

        // Users you blocked don't show up in your search. (Users who blocked
        // you still appear — hiding them would reveal the block; messaging
        // them fails with a generic error instead.)
        const blockedByMe = (req.user.blockedUsers || []).map((id) => String(id));
        const hiddenIds = [String(loggedInUser), ...blockedByMe];

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);

        let filter;

        if (isEmail) {
            // Exact email search
            filter = {
                _id: { $nin: hiddenIds },
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
                _id: { $nin: hiddenIds },
                username: {
                    $regex: `^${safeQuery}`,
                    $options: "i",
                },
            };
        }

        const filteredUsers = await User.find(filter)
            .select("_id fullName username profilePic publicKey privacy")
            .limit(20)
            .lean();

        // Honor profile-photo privacy: users who chose "nobody" appear with
        // no photo in search results.
        res.status(200).json(applyPhotoPrivacyToList(filteredUsers));
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

function sidebarCacheKey(userId) { return `chat:sidebar:${userId}`; }
function messagesCacheKey(a, b) { return `chat:msgs:${[String(a), String(b)].sort().join(':')}`; }
function callsCacheKey(userId) { return `chat:calls:${userId}`; }

async function invalidateChatCache(userA, userB) {
    const keys = [
        sidebarCacheKey(userA),
        sidebarCacheKey(userB),
        messagesCacheKey(userA, userB),
    ];
    await Promise.all(keys.map(k => safeCache.del(k)));
}

export async function getConversationsForSidebar(req, res) {
    try {
        const loggedInUser = req.userId;
        const cacheKey = sidebarCacheKey(loggedInUser);
        const cached = await safeCache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const conversations = await Message.aggregate([
            {
                $facet: {
                    sent: [
                        { $match: { senderId: loggedInUser, deletedFor: { $nin: [loggedInUser] }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] } },
                        { $sort: { createdAt: -1 } },
                        { $group: { _id: "$receiverId", lastMessage: { $first: "$ROOT" }, lastMessageAt: { $first: "$createdAt" } } }
                    ],
                    received: [
                        { $match: { receiverId: loggedInUser, deletedFor: { $nin: [loggedInUser] }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] } },
                        { $sort: { createdAt: -1 } },
                        { $group: { _id: "$senderId", lastMessage: { $first: "$ROOT" }, lastMessageAt: { $first: "$createdAt" } } }
                    ]
                }
            },
            { $project: { all: { $concatArrays: ["$sent", "$received"] } } },
            { $unwind: "$all" },
            { $replaceRoot: { newRoot: "$all" } },
            { $sort: { lastMessageAt: -1 } },
            {
                $group: {
                    _id: "$_id",
                    lastMessage: { $first: "$lastMessage" },
                    lastMessageAt: { $first: "$lastMessageAt" },
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
                                        { $eq: ["$senderId", "$partnerId"] },
                                        { $eq: ["$receiverId", loggedInUser] },
                                        { $eq: ["$readAt", null] },
                                        // Expired disappearing messages are not "unread".
                                        {
                                            $or: [
                                                { $eq: ["$expiresAt", null] },
                                                { $gt: ["$expiresAt", "$$NOW"] },
                                            ],
                                        },
                                    ],
                                },
                                // A message the reader deleted for themselves is not "unread".
                                deletedFor: { $nin: [loggedInUser] },
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
                    // Profile-photo privacy: blank the photo when the owner
                    // chose "nobody".
                    profilePic: {
                        $cond: [
                            { $eq: ["$user.privacy.profilePhoto", "nobody"] },
                            "",
                            "$user.profilePic",
                        ],
                    },
                    publicKey: 1,
                    unreadCount: 1,
                    lastMessageAt: 1,
                    lastMessage: {
                        _id: "$lastMessage._id",
                        senderId: "$lastMessage.senderId",
                        receiverId: "$lastMessage.receiverId",
                        text: "$lastMessage.text",
                        ciphertext: "$lastMessage.ciphertext",
                        iv: "$lastMessage.iv",
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

        const result = conversations.map((conversation) => ({
            ...conversation,
            lastMessage: presentMessage(conversation.lastMessage),
        }));
        await safeCache.setex(cacheKey, 60, result);
        res.status(200).json(result);

    } catch (error) {
        console.log("Error in getConversationsForSidebar: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function getMessages(req, res) {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.userId;
        const isPaginated = req.query.before;

        if (!isPaginated) {
            const cacheKey = messagesCacheKey(senderId, receiverId);
            const cached = await safeCache.get(cacheKey);
            if (cached) {
                // Fire-and-forget read receipts — don't block the response
                if (readReceiptsEnabled(req.user)) {
                    markUnreadMessagesAsRead(senderId, receiverId).catch(() => {});
                }
                return res.status(200).json(cached);
            }
        }

        if (readReceiptsEnabled(req.user)) {
            await markUnreadMessagesAsRead(senderId, receiverId);
        }

        const filter = {
            $or: [
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId },
            ],
            deletedFor: { $nin: [senderId] },
            $and: [notExpiredClause()],
        };

        // The legacy array response remains available unless a client opts into pagination.
        if (req.query.paginated !== "true") {
            const messages = await Message.find(filter).populate("replyTo", MESSAGE_POPULATE).sort({ createdAt: 1 }).limit(100);
            return res.status(200).json(presentMessagesMedia(messages));
        }

        const { limit, before } = getPageOptions(req);
        if (before) {
            filter.$and.push({
                $or: [
                    { createdAt: { $lt: before.createdAt } },
                    { createdAt: before.createdAt, _id: { $lt: before.id } },
                ]
            });
        }
        const page = await Message.find(filter).populate("replyTo", MESSAGE_POPULATE)
            .sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
        const hasMore = page.length > limit;
        const messages = (hasMore ? page.slice(0, limit) : page).reverse();

        const result = { messages: presentMessagesMedia(messages), hasMore, nextCursor: hasMore ? makeCursor(messages[0]) : null };
        if (!isPaginated) {
            await safeCache.setex(messagesCacheKey(senderId, receiverId), 30, result);
        }
        res.status(200).json(result);
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
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).select("_id");

    if (unreadMessages.length === 0) return [];

    const readAt = new Date();
    const messageIds = unreadMessages.map((message) => message._id);

    await Message.updateMany(
    { _id: { $in: messageIds }, deliveredAt: null },
    // Backfill deliveredAt only when it was never set, instead of
    // clobbering the true delivery timestamp with the read time.
    { $set: { readAt, deliveredAt: readAt } },
);
await Message.updateMany(
    { _id: { $in: messageIds }, deliveredAt: { $ne: null } },
    { $set: { readAt } },
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

        // Read receipts disabled: never mark, never emit.
        if (!readReceiptsEnabled(req.user)) {
            return res.status(200).json({ messageIds: [] });
        }

        const messageIds = await markUnreadMessagesAsRead(readerId, conversationPartnerId);
        await invalidateChatCache(readerId, conversationPartnerId);

        res.status(200).json({ messageIds });
    } catch (error) {
        console.log("Error in markConversationAsRead: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function sendMessage(req, res) {
    try {
        const { text, ciphertext, iv, replyTo, clientId: rawClientId } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.userId;
        const receiver = await User.findById(receiverId).select("_id blockedUsers");
        if (!receiver) return res.status(404).json({ message: "User not found." });

        // Blocked in either direction: no messages. The 403 message is
        // generic so blocking stays private.
        const iBlockedThem = (req.user.blockedUsers || []).some((id) => String(id) === String(receiverId));
        const theyBlockedMe = (receiver.blockedUsers || []).some((id) => String(id) === String(senderId));
        if (iBlockedThem || theyBlockedMe) {
            return res.status(403).json({ message: "You cannot message this user." });
        }

        // Idempotency: a retried send (network retry, double-tap) carries the
        // same clientId, so return the already-created message instead of
        // minting a duplicate. Checked before any media upload.
        const clientId = typeof rawClientId === "string" && rawClientId.trim() ? rawClientId.trim() : null;
        if (clientId) {
            const existingMessage = await Message.findOne({ senderId, clientId });
            if (existingMessage) {
                const populatedExisting = await populateReply(existingMessage._id);
                return res.status(200).json(presentMessage(populatedExisting));
            }
        }

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

            const { filePath } = await uploadChatMedia(mediaFile);
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

        if (!text?.trim() && !ciphertext?.trim() && !mediaFile) {
            return res.status(400).json({ message: "Message text or media is required." });
        }

        const receiverSocketId = getReceiverSocketId(receiverId);
        const deliveredAt = (await isUserOnline(receiverId)) ? new Date() : null;

        let validReplyTo = null;

        if (replyTo) {
            const repliedMessage = await Message.findById(replyTo);

            if (!repliedMessage) {
                return res.status(400).json({
                    message: "Invalid reply message.",
                });
            }

            if (repliedMessage.expiresAt && repliedMessage.expiresAt <= new Date()) {
                return res.status(400).json({
                    message: "That message has expired.",
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

        const disappearingDuration = await dmDisappearingDuration(senderId, receiverId);

        // Forwarded marker: the client re-sends decrypted content as a new
        // message (ciphertext can't be reused — it was encrypted for others).
        let forwardedFrom = null;
        if (req.body.isForwarded && req.body.forwardedFrom) {
            const fwdOriginal = await Message.findById(req.body.forwardedFrom);
            if (fwdOriginal && await isMessageParticipant(fwdOriginal, senderId)) {
                forwardedFrom = fwdOriginal._id;
            }
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text: text || "",
            ciphertext: ciphertext || "",
            iv: iv || "",
            clientId: clientId || undefined,
            image: imageUrl || "",
            video: videoUrl || "",
            audio: audioUrl || "",
            file: fileUrl || "",
            fileName: fileName || "",
            fileType: fileType || "",
            fileSize: fileSize || 0,
            deliveredAt,
            replyTo: validReplyTo,
            expiresAt: expiryDateFor(disappearingDuration),
            isForwarded: Boolean(forwardedFrom),
            forwardedFrom,
        });

        await newMessage.save();
        const populatedMessage = await populateReply(newMessage._id);

        const senderSocketId = getReceiverSocketId(senderId);
        const messageSocketIds = [...new Set([...receiverSocketId, ...senderSocketId])];

        if (messageSocketIds.length > 0) {
            io.to(messageSocketIds).emit("newMessage", presentMessage(populatedMessage));
        }

        if (receiverSocketId.length === 0) {
            const senderDoc = await User.findById(senderId).select("fullName profilePic privacy").lean();
            const sender = applyPhotoPrivacy(senderDoc);
            if (sender) sendMessageNotification({ receiverId, sender, message: populatedMessage }).catch((error) => console.error("Message push failed:", error.message));
        }

        await invalidateChatCache(senderId, receiverId);
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

        if (!message.isPinned && message.expiresAt && message.expiresAt <= new Date()) {
            return res.status(400).json({ message: "That message has expired." });
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

        // Bound the fan-out: every recipient triggers a DB write, socket
        // emits, and possibly a push notification.
        if (targetReceiverIds.length > 20) {
            return res.status(400).json({ message: "You can forward to at most 20 recipients at once." });
        }

        if (targetReceiverIds.some((targetId) => targetId === senderId.toString())) {
            return res.status(400).json({ message: "You cannot forward a message to yourself." });
        }

        const originalMessage = await Message.findById(id);

        if (!originalMessage) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (originalMessage.expiresAt && originalMessage.expiresAt <= new Date()) {
            return res.status(400).json({ message: "That message has expired." });
        }

        if (!(await isMessageParticipant(originalMessage, senderId))) {
            return res.status(403).json({ message: "Not allowed" });
        }

        const receivers = await User.find({ _id: { $in: targetReceiverIds } }).select("_id");

        if (receivers.length !== targetReceiverIds.length) {
            return res.status(404).json({ message: "One or more recipients were not found" });
        }

        const forwardedMessages = [];
        const senderForNotification = applyPhotoPrivacy(
            await User.findById(senderId).select("fullName profilePic privacy").lean()
        );

        for (const targetReceiverId of targetReceiverIds) {
            const receiverSocketIds = getReceiverSocketId(targetReceiverId);
            const deliveredAt = (await isUserOnline(targetReceiverId)) ? new Date() : null;

            const forwardedMessage = new Message({
                senderId,
                receiverId: targetReceiverId,
                text: originalMessage.text || "",
                ciphertext: originalMessage.ciphertext || "",
                iv: originalMessage.iv || "",
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

            await invalidateChatCache(senderId, targetReceiverId);
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
        const { text, ciphertext, iv } = req.body;
        const myId = req.userId;

        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (message.senderId.toString() !== myId.toString()) {
            return res.status(403).json({ message: "You can edit only your own message" });
        }

        // E2EE: an encrypted message must stay encrypted — the client
        // re-encrypts the edited text; never accept a plaintext downgrade.
        if (message.ciphertext) {
            if (!ciphertext || !iv) {
                return res.status(400).json({ message: "Encrypted messages must stay encrypted." });
            }
            message.ciphertext = String(ciphertext);
            message.iv = String(iv);
            message.text = "";
        } else {
            if (!text || !text.trim()) {
                return res.status(400).json({ message: "Message text is required" });
            }
            message.text = text.trim();
        }
        message.isEdited = true;

        await message.save();
        const populatedMessage = await populateReply(message._id);

        const socketIds = await getMessageSocketIds(message);
        if (socketIds.length) io.to(socketIds).emit("messageEdited", presentMessage(populatedMessage));
        await invalidateChatCache(message.senderId, message.receiverId);

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

        const cleanEmoji = emoji.trim();
        if (cleanEmoji.length < 1 || cleanEmoji.length > 16) {
            return res.status(400).json({ message: "Invalid reaction emoji." });
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

        if (existingReactionIndex >= 0 && message.reactions[existingReactionIndex].emoji === cleanEmoji) {
            message.reactions.splice(existingReactionIndex, 1);
        } else if (existingReactionIndex >= 0) {
            message.reactions[existingReactionIndex].emoji = cleanEmoji;
        } else {
            message.reactions.push({ userId, emoji: cleanEmoji });
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
            await invalidateChatCache(message.senderId, message.receiverId);

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
        }

        await invalidateChatCache(message.senderId, message.receiverId || myId);

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

// ---------------------------------------------------------------------------
// Disappearing messages (direct chats)
// ---------------------------------------------------------------------------

export async function getDisappearing(req, res) {
    try {
        const { id: peerId } = req.params;
        if (String(peerId) === String(req.userId)) {
            return res.status(400).json({ message: "Invalid conversation." });
        }
        const peerExists = await User.exists({ _id: peerId });
        if (!peerExists) return res.status(404).json({ message: "User not found." });
        const duration = await dmDisappearingDuration(req.userId, peerId);
        res.status(200).json({ duration });
    } catch (error) {
        console.log("Error in getDisappearing:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function setDisappearing(req, res) {
    try {
        const { id: peerId } = req.params;
        const duration = Number(req.body.duration);
        if (!isValidDisappearingDuration(duration)) {
            return res.status(400).json({ message: "Invalid duration." });
        }
        if (String(peerId) === String(req.userId)) {
            return res.status(400).json({ message: "Invalid conversation." });
        }
        const peerExists = await User.exists({ _id: peerId });
        if (!peerExists) return res.status(404).json({ message: "User not found." });

        await ConversationSetting.findOneAndUpdate(
            { key: dmSettingKey(req.userId, peerId) },
            { $set: { disappearingDuration: duration } },
            { upsert: true }
        );

        // Keep the other party's open info panel in sync.
        const peerSocketIds = getReceiverSocketId(peerId);
        if (peerSocketIds.length > 0) {
            io.to(peerSocketIds).emit("disappearingChanged", {
                conversationId: String(req.userId),
                duration,
            });
        }

        res.status(200).json({ duration });
    } catch (error) {
        console.log("Error in setDisappearing:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ---------------------------------------------------------------------------
// Expired-message cleanup (run by cron)
// ---------------------------------------------------------------------------

const MEDIA_FILE_ID_KEYS = ["imageFileId", "videoFileId", "audioFileId", "fileFileId"];

// Deletes messages past expiresAt together with their ImageKit files, and
// tells connected clients to drop them from open chats immediately. Message
// reads also filter expired documents, so a missed cron run never leaks
// content — it only delays physical deletion.
export async function deleteExpiredMessages(batchSize = 200) {
    const now = new Date();
    const expired = await Message.find({ expiresAt: { $lte: now } })
        .select(["_id", "senderId", "receiverId", "groupId", ...MEDIA_FILE_ID_KEYS].join(" "))
        .limit(batchSize)
        .lean();
    if (expired.length === 0) return 0;

    const fileIds = [];
    for (const message of expired) {
        for (const key of MEDIA_FILE_ID_KEYS) {
            if (message[key]) fileIds.push(message[key]);
        }
    }
    if (fileIds.length > 0 && hasImagekitConfig()) {
        const results = await Promise.allSettled(fileIds.map((fileId) => deleteChatMedia(fileId)));
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.log("Expired-media cleanup failed for", fileIds[index], "-", result.reason?.message || result.reason);
            }
        });
    }

    const ids = expired.map((message) => message._id);
    await Message.deleteMany({ _id: { $in: ids } });

    // Notify connected participants so open chats drop the messages live.
    const groupIds = [...new Set(expired.filter((m) => m.groupId).map((m) => String(m.groupId)))];
    const groupMembers = new Map();
    if (groupIds.length > 0) {
        const groups = await Group.find({ _id: { $in: groupIds } }).select("_id members").lean();
        for (const group of groups) {
            groupMembers.set(String(group._id), (group.members || []).map(String));
        }
    }
    for (const message of expired) {
        const userIds = message.groupId
            ? groupMembers.get(String(message.groupId)) || []
            : [String(message.senderId), String(message.receiverId)].filter(Boolean);
        const socketIds = [...new Set(userIds.flatMap((id) => getReceiverSocketId(id)))];
        if (socketIds.length > 0) {
            io.to(socketIds).emit("messagesExpired", { messageIds: [String(message._id)] });
        }
    }

    // Drop any cached sidebar/history snapshots that still reference the
    // deleted messages.
    const dmPairs = expired.filter((m) => !m.groupId && m.senderId && m.receiverId);
    for (const m of dmPairs) {
        await invalidateChatCache(String(m.senderId), String(m.receiverId));
    }
    const groupUserIds = [...new Set(
        expired.filter((m) => m.groupId).flatMap((m) => groupMembers.get(String(m.groupId)) || [])
    )];
    if (groupUserIds.length > 0) {
        await Promise.all(groupUserIds.map((id) => safeCache.del(sidebarCacheKey(id))));
    }

    return expired.length;
}
