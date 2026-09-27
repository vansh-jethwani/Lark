import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { presentMessageMedia, presentMessagesMedia } from "../lib/media.js";
import { expiryDateFor, isValidDisappearingDuration } from "../lib/disappearing.js";
import { applyPhotoPrivacyToList } from "../lib/privacy.js";

const populate = (query) =>
  query
    // publicKey is selected so members can wrap the group E2EE key for each member.
    .populate("members", "fullName username profilePic privacy publicKey")
    .populate("admins", "_id fullName username profilePic privacy publicKey")
    .populate("createdBy", "_id fullName username profilePic privacy publicKey")
    .lean();

const id = (value) => String(value);

const isAdmin = (group, userId) =>
  group.admins.some((admin) => id(admin._id || admin) === id(userId));

const isMember = (group, userId) =>
  group.members.some((member) => id(member._id || member) === id(userId));

function sanitizeGroup(group) {
  if (!group) return null;
  const latestWraps = (group.keyWraps || []).length
    ? group.keyWraps[group.keyWraps.length - 1]
    : null;
  return {
    _id: group._id,
    name: group.name,
    profilePic: presentMessageMedia({ image: group.profilePic }).image,
    description: group.description,
    // Profile-photo privacy: members who chose "nobody" are listed photo-less.
    members: applyPhotoPrivacyToList(group.members),
    admins: applyPhotoPrivacyToList(group.admins),
    createdBy: group.createdBy ? applyPhotoPrivacyToList([group.createdBy])[0] : group.createdBy,
    permissions: group.permissions,
    disappearingDuration: group.disappearingDuration || 0,
    // Group E2EE: keyVersion 0 = not encrypted yet. keyHolders lists the
    // members holding a wrapped copy of the current key version.
    keyVersion: group.keyVersion || 0,
    keyHolders: latestWraps ? latestWraps.wraps.map((wrap) => String(wrap.userId)) : [],
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

// Group E2EE: validate a client-supplied key rotation against the group state
// and the intended member list. `rotation` is
// { expectedVersion, wrapperPublicKey, wraps: [{ userId, wrappedKey }] }.
function validateKeyRotation(group, rotation, newMembers) {
  if (!rotation) return { ok: true, apply: false };
  const expectedVersion = Number(rotation.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return { ok: false, message: "Invalid key version." };
  }
  if ((group.keyVersion || 0) !== expectedVersion) {
    return { ok: false, conflict: true, message: "The group key changed. Please retry." };
  }
  const wraps = Array.isArray(rotation.wraps) ? rotation.wraps : [];
  const memberIds = newMembers.map((member) => id(member._id || member));
  const wrapIds = wraps.map((wrap) => String(wrap.userId));
  if (
    wrapIds.length !== memberIds.length ||
    new Set(wrapIds).size !== wrapIds.length ||
    !memberIds.every((memberId) => wrapIds.includes(memberId))
  ) {
    return { ok: false, message: "Key wraps must cover exactly the new member list." };
  }
  for (const wrap of wraps) {
    if (typeof wrap.wrappedKey !== "string" || !wrap.wrappedKey || wrap.wrappedKey.length > 2000) {
      return { ok: false, message: "Invalid key wrap." };
    }
  }
  const wrapperPublicKey = String(rotation.wrapperPublicKey || "");
  if (
    !wrapperPublicKey ||
    wrapperPublicKey.length > 512 ||
    !/^[A-Za-z0-9+/=_-]+$/.test(wrapperPublicKey)
  ) {
    return { ok: false, message: "Invalid wrapper public key." };
  }
  return {
    ok: true,
    apply: true,
    version: expectedVersion + 1,
    wrapperPublicKey,
    wraps: wraps.map((wrap) => ({ userId: wrap.userId, wrappedKey: wrap.wrappedKey })),
  };
}

async function applyKeyRotation(group, rotation) {
  group.keyVersion = rotation.version;
  const next = [
    ...(group.keyWraps || []),
    {
      version: rotation.version,
      wrapperPublicKey: rotation.wrapperPublicKey,
      wraps: rotation.wraps,
    },
  ];
  // Retain every key version still referenced by a stored message so history
  // stays readable; drop only versions no message uses anymore.
  const oldestUsed = await Message.findOne({ groupId: group._id, keyVersion: { $gt: 0 } })
    .sort({ keyVersion: 1 })
    .select("keyVersion")
    .lean();
  const cutoff = oldestUsed?.keyVersion ?? rotation.version;
  group.keyWraps = next.filter((entry) => entry.version >= cutoff);
}

// Drop wrapped keys of people who are no longer members (hygiene when a
// membership change ships without a rotation; the next sender rotates lazily).
function pruneKeyWraps(group) {
  const memberIds = new Set(group.members.map((member) => id(member._id || member)));
  group.keyWraps = (group.keyWraps || []).map((entry) => ({
    version: entry.version,
    wrapperPublicKey: entry.wrapperPublicKey,
    wraps: (entry.wraps || []).filter((wrap) => memberIds.has(String(wrap.userId))),
  }));
}

const broadcast = (group) => {
  const data = sanitizeGroup(group);
  group.members.forEach((member) => {
    const socketIds = getReceiverSocketId(member._id || member);
    socketIds.forEach((socketId) => io.to(socketId).emit("group:updated", data));
  });
};

const broadcastToGroup = (group, event, payload) => {
  group.members.forEach((member) => {
    const socketIds = getReceiverSocketId(member._id || member);
    socketIds.forEach((socketId) => io.to(socketId).emit(event, payload));
  });
};

const groupSocketIds = (group) => [...new Set(group.members.flatMap((member) =>
  getReceiverSocketId(member._id || member)))];

async function findMemberGroup(groupId, userId) {
  return Group.findOne({ _id: groupId, members: userId });
}

function getPageOptions(req) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 40, 1), 100);
  if (!req.query.before) return { limit, before: null };
  try {
    const value = JSON.parse(Buffer.from(req.query.before, "base64url").toString("utf8"));
    return value.createdAt && value.id ? { limit, before: { createdAt: new Date(value.createdAt), id: value.id } } : { limit, before: null };
  } catch { return { limit, before: null }; }
}

const makeCursor = (message) => message
  ? Buffer.from(JSON.stringify({ createdAt: message.createdAt, id: message._id })).toString("base64url")
  : null;

export async function getGroupMessages(req, res) {
  try {
    const group = await findMemberGroup(req.params.id, req.userId);
    if (!group) return res.status(404).json({ message: "Group not found." });
    const now = new Date();
    const filter = { groupId: group._id, deletedFor: { $nin: [req.userId] }, $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }] };
    if (req.query.paginated !== "true") {
      const messages = await Message.find(filter).populate("senderId", "fullName username profilePic privacy")
        .populate("replyTo", "text ciphertext iv keyVersion mediaIv image video audio file fileName senderId").sort({ createdAt: 1 }).limit(100);
      return res.json(presentMessagesMedia(messages));
    }
    const { limit, before } = getPageOptions(req);
    if (before) filter.$and.push({ $or: [{ createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before.id } }] });
    const page = await Message.find(filter).populate("senderId", "fullName username profilePic privacy")
      .populate("replyTo", "text ciphertext iv keyVersion mediaIv image video audio file fileName senderId").sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
    const hasMore = page.length > limit;
    const messages = (hasMore ? page.slice(0, limit) : page).reverse();
    res.json({ messages: presentMessagesMedia(messages), hasMore, nextCursor: hasMore ? makeCursor(messages[0]) : null });
  } catch (error) {
    console.log("Error in getGroupMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function sendGroupMessage(req, res) {
  try {
    const group = await findMemberGroup(req.params.id, req.userId);
    if (!group) return res.status(403).json({ message: "You are not a member of this group." });
    if (group.permissions.sendMessages === "admins" && !isAdmin(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can send messages in this group." });
    }
    const mediaFile = req.file;
    const text = String(req.body.text || "").trim();
    // E2EE: encrypted payload (client-side). ciphertext/iv carry the text,
    // mediaIv carries the IV for encrypted media bytes, keyVersion selects the
    // group key. The server stores them opaquely.
    const ciphertext = String(req.body.ciphertext || "");
    const iv = String(req.body.iv || "");
    const mediaIv = String(req.body.mediaIv || "");
    const keyVersion = Number(req.body.keyVersion) || 0;
    if (keyVersion < 0 || !Number.isInteger(keyVersion)) {
      return res.status(400).json({ message: "Invalid key version." });
    }
    if (!text && !(ciphertext && iv) && !mediaFile) return res.status(400).json({ message: "Message text or media is required." });
    // Idempotency: a retried send carries the same clientId, so return the
    // already-created message instead of minting a duplicate.
    const rawClientId = req.body.clientId;
    const clientId = typeof rawClientId === "string" && rawClientId.trim() ? rawClientId.trim() : null;
    if (clientId) {
      const existing = await Message.findOne({ senderId: req.userId, clientId });
      if (existing) {
        const populatedExisting = await Message.findById(existing._id)
          .populate("senderId", "fullName username profilePic privacy")
          .populate("replyTo", "text ciphertext iv keyVersion mediaIv image video audio file fileName senderId");
        return res.status(200).json(presentMessageMedia(populatedExisting));
      }
    }
    let media = {};
    if (mediaFile) {
      if (!hasImagekitConfig()) return res.status(503).json({ message: "Media upload is not configured." });
      const { filePath, fileId } = await uploadChatMedia(mediaFile);
      // E2EE: for client-encrypted uploads the bytes are opaque ciphertext, so
      // the client tells us the real kind/type instead of the octet-stream wrapper.
      const declaredKind = String(req.body.mediaKind || "");
      const kind = ["image", "video", "audio", "file"].includes(declaredKind)
        ? declaredKind
        : mediaFile.mimetype.startsWith("image") ? "image" : mediaFile.mimetype.startsWith("video") ? "video" : mediaFile.mimetype.startsWith("audio") ? "audio" : "file";
      const originalFileType = String(req.body.originalFileType || mediaFile.mimetype);
      media = { [kind]: filePath, [`${kind}FileId`]: fileId, fileName: mediaFile.originalname, fileType: originalFileType, fileSize: mediaFile.size };
    }

    // A reply target must exist and live in THIS group. Without this check a
    // member could attach any message (e.g. someone's DM) and its content
    // would be broadcast to every group member.
    let validReplyTo = null;
    if (req.body.replyTo) {
      const repliedMessage = await Message.findById(req.body.replyTo);
      if (!repliedMessage) {
        return res.status(400).json({ message: "Invalid reply message." });
      }
      if (repliedMessage.expiresAt && repliedMessage.expiresAt <= new Date()) {
        return res.status(400).json({ message: "That message has expired." });
      }
      const inSameGroup = repliedMessage.groupId && String(repliedMessage.groupId) === String(group._id);
      const requesterIsParticipant = repliedMessage.groupId
        ? Boolean(await Group.exists({ _id: repliedMessage.groupId, members: req.userId }))
        : [repliedMessage.senderId, repliedMessage.receiverId].some(
            (participant) => participant && String(participant) === String(req.userId)
          );
      if (!inSameGroup || !requesterIsParticipant) {
        return res.status(403).json({ message: "You cannot reply to this message." });
      }
      validReplyTo = repliedMessage._id;
    }

    // Forwarded marker: the client re-sends decrypted content as a new message
    // (it cannot reuse ciphertext — that was encrypted for other recipients).
    let forwardedFrom = null;
    if (req.body.isForwarded && req.body.forwardedFrom) {
      const fwdOriginal = await Message.findById(req.body.forwardedFrom);
      const canForward = fwdOriginal && (
        fwdOriginal.groupId
          ? await Group.exists({ _id: fwdOriginal.groupId, members: req.userId })
          : [fwdOriginal.senderId, fwdOriginal.receiverId].some(
              (participant) => participant && String(participant) === String(req.userId)
            )
      );
      if (canForward) forwardedFrom = fwdOriginal._id;
    }

    const message = await Message.create({ senderId: req.userId, groupId: group._id, text, ciphertext, iv, mediaIv, keyVersion, replyTo: validReplyTo, clientId: clientId || undefined, expiresAt: expiryDateFor(group.disappearingDuration), isForwarded: Boolean(forwardedFrom), forwardedFrom, ...media });
    const populated = await Message.findById(message._id)
      .populate("senderId", "fullName username profilePic privacy")
      .populate("replyTo", "text ciphertext iv keyVersion mediaIv image video audio file fileName senderId");
    const sockets = groupSocketIds(group);
    if (sockets.length) io.to(sockets).emit("newMessage", presentMessageMedia(populated));
    await Group.updateOne({ _id: group._id }, { $set: { updatedAt: new Date() } });
    res.status(201).json(presentMessageMedia(populated));
  } catch (error) {
    console.log("Error in sendGroupMessage:", error.message);
    res.status(500).json({ message: "Failed to send group message." });
  }
}

export async function getGroupMedia(req, res) {
  try {
    const group = await findMemberGroup(req.params.id, req.userId);
    if (!group) return res.status(404).json({ message: "Group not found." });
    const messages = await Message.find({
      $and: [
        { groupId: group._id, deletedFor: { $nin: [req.userId] } },
        { $or: [{ image: { $ne: "" } }, { video: { $ne: "" } }, { audio: { $ne: "" } }, { file: { $ne: "" } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    })
      .select("image video audio file fileName fileType fileSize senderId createdAt keyVersion mediaIv").sort({ createdAt: -1 }).limit(60);
    res.json(presentMessagesMedia(messages));
  } catch (error) { res.status(500).json({ message: "Internal server error" }); }
}

export async function listGroups(req, res) {
  try {
    const groups = await populate(
      Group.find({ members: req.userId }).sort({ updatedAt: -1 })
    );
    res.json(groups.map(sanitizeGroup));
  } catch (error) {
    console.log("Error in listGroups:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getGroupDetails(req, res) {
  try {
    const group = await populate(
      Group.findOne({ _id: req.params.id, members: req.userId })
    );
    if (!group) return res.status(404).json({ message: "Group not found." });
    res.json(sanitizeGroup(group));
  } catch (error) {
    console.log("Error in getGroupDetails:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Group E2EE: return the requester's wrapped copy of a group key version.
// The server never sees the plaintext key — unwrapping happens client-side.
// Defaults to the latest version; pass ?version=N for history.
export async function getMyGroupKey(req, res) {
  try {
    const group = await Group.findOne({ _id: req.params.id, members: req.userId })
      .select("keyVersion keyWraps");
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!group.keyVersion) return res.status(404).json({ message: "This group is not encrypted yet." });
    const wantVersion = Number(req.query.version) || group.keyVersion;
    const entry = (group.keyWraps || []).find((candidate) => candidate.version === wantVersion);
    if (!entry) return res.status(404).json({ message: "No key available for that version." });
    const wrap = (entry.wraps || []).find(
      (candidate) => String(candidate.userId) === String(req.userId)
    );
    if (!wrap) return res.status(404).json({ message: "No key available for you in this group." });
    res.json({
      keyVersion: entry.version,
      wrappedKey: wrap.wrappedKey,
      wrapperPublicKey: entry.wrapperPublicKey || "",
    });
  } catch (error) {
    console.log("Error in getMyGroupKey:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Group E2EE: standalone key rotation (used for lazy rotation before sending
// when the member set no longer matches the key coverage).
export async function rotateGroupKey(req, res) {
  try {
    const group = await Group.findOne({ _id: req.params.id, members: req.userId });
    if (!group) return res.status(404).json({ message: "Group not found." });
    const rotation = validateKeyRotation(group, req.body, group.members);
    if (!rotation.ok) {
      return res.status(rotation.conflict ? 409 : 400).json({ message: rotation.message, keyVersion: group.keyVersion || 0 });
    }
    if (!rotation.apply) {
      return res.status(400).json({ message: "Key rotation data is required." });
    }
    await applyKeyRotation(group, rotation);
    await group.save();
    const result = await populate(Group.findById(group._id));
    const sanitized = sanitizeGroup(result);
    broadcastToGroup(result, "group:key-rotated", {
      groupId: group._id,
      keyVersion: sanitized.keyVersion,
      keyHolders: sanitized.keyHolders,
    });
    res.json({ keyVersion: sanitized.keyVersion, keyHolders: sanitized.keyHolders });
  } catch (error) {
    console.log("Error in rotateGroupKey:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createGroup(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const memberIds = [
      ...new Set(
        (Array.isArray(req.body.memberIds) ? req.body.memberIds : []).map(id)
      ),
    ];

    if (!name) {
      return res.status(400).json({ message: "Group name is required." });
    }

    if (memberIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Add at least one member to create a group." });
    }

    if (memberIds.length > 50) {
      return res
        .status(400)
        .json({ message: "You can add at most 50 members at once." });
    }

    const users = await User.find({ _id: { $in: memberIds } }).select("_id");
    if (users.length !== memberIds.length) {
      return res.status(400).json({ message: "One or more members are invalid." });
    }

    const members = [...new Set([id(req.userId), ...memberIds])];
    if (members.length > 256) {
      return res
        .status(400)
        .json({ message: "Groups are limited to 256 members." });
    }
    // Optional E2EE bootstrap: the creator wraps the fresh group key for every
    // member client-side; the server only stores the opaque wrapped copies.
    const bootstrapRotation = req.body.keyWraps
      ? { expectedVersion: 0, wrapperPublicKey: req.body.keyWrapperPublicKey, wraps: req.body.keyWraps }
      : null;
    const bootstrap = validateKeyRotation({ keyVersion: 0 }, bootstrapRotation, members);
    if (!bootstrap.ok) {
      return res.status(400).json({ message: bootstrap.message });
    }
    const group = await Group.create({
      name,
      profilePic: req.body.profilePic || "",
      description: req.body.description || "",
      members,
      admins: [req.userId],
      createdBy: req.userId,
      ...(bootstrap.apply
        ? {
            keyVersion: bootstrap.version,
            keyWraps: [{
              version: bootstrap.version,
              wrapperPublicKey: bootstrap.wrapperPublicKey,
              wraps: bootstrap.wraps,
            }],
          }
        : {}),
    });

    const result = await populate(Group.findById(group._id));
    broadcast(result);
    res.status(201).json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in createGroup:", error.message);
    res.status(500).json({ message: "Failed to create group." });
  }
}

export async function updateGroup(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });

    // Disappearing-message timer: any member may change it (WhatsApp-style).
    // It is handled separately from the admin-gated info fields below.
    if (req.body.disappearingDuration !== undefined) {
      const duration = Number(req.body.disappearingDuration);
      if (!isValidDisappearingDuration(duration)) {
        return res.status(400).json({ message: "Invalid duration." });
      }
      group.disappearingDuration = duration;
      await group.save();
      const updated = await populate(Group.findById(group._id));
      broadcast(updated);
      return res.json(sanitizeGroup(updated));
    }

    if (!isAdmin(group, req.userId) && group.permissions.editInfo !== "members") {
      return res.status(403).json({ message: "Not allowed to edit group info." });
    }

    ["name", "profilePic", "description"].forEach((key) => {
      if (req.body[key] !== undefined) {
        group[key] = String(req.body[key]).trim();
      }
    });

    await group.save();
    const result = await populate(Group.findById(group._id));
    broadcast(result);
    res.json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in updateGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updatePermissions(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!isAdmin(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can update permissions." });
    }

    const allowed = ["editInfo", "addMembers", "sendMessages"];
    // Validate every entry first: a `return` inside forEach only exits the
    // callback, so validating in a loop lets execution fall through to
    // group.save() and a second res.json() (ERR_HTTP_HEADERS_SENT).
    const permissionUpdates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const value = String(req.body[key]).trim().toLowerCase();
        if (value !== "admins" && value !== "members") {
          return res.status(400).json({ message: `Invalid permission value for ${key}.` });
        }
        permissionUpdates[key] = value;
      }
    }
    Object.assign(group.permissions, permissionUpdates);

    await group.save();
    const result = await populate(Group.findById(group._id));
    broadcast(result);
    res.json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in updatePermissions:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function addMembers(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!isAdmin(group, req.userId) && group.permissions.addMembers !== "members") {
      return res.status(403).json({ message: "Not allowed to add members." });
    }

    const memberIds = [
      ...new Set((req.body.memberIds || []).map(id)),
    ];

    if (memberIds.length > 50) {
      return res
        .status(400)
        .json({ message: "You can add at most 50 members at once." });
    }

    const users = await User.find({ _id: { $in: memberIds } }).select("_id");
    if (users.length !== memberIds.length) {
      return res.status(400).json({ message: "One or more members are invalid." });
    }

    const newMembers = memberIds.filter(
      (memberId) => !group.members.some((m) => id(m) === id(memberId))
    );

    if (newMembers.length === 0) {
      return res.status(400).json({ message: "All selected users are already members." });
    }

    if (group.members.length + newMembers.length > 256) {
      return res
        .status(400)
        .json({ message: "Groups are limited to 256 members." });
    }

    group.members = [...group.members, ...newMembers];
    // E2EE: the adder rotates the group key atomically with the membership
    // change, so new members receive a wrapped copy of the fresh key and can
    // only read messages sent from here on.
    const rotation = validateKeyRotation(group, req.body.keyRotation, group.members);
    if (!rotation.ok) {
      return res.status(rotation.conflict ? 409 : 400).json({ message: rotation.message, keyVersion: group.keyVersion || 0 });
    }
    if (rotation.apply) await applyKeyRotation(group, rotation);
    else pruneKeyWraps(group);
    await group.save();

    const result = await populate(Group.findById(group._id));
    broadcastToGroup(result, "group:member-added", {
      group: sanitizeGroup(result),
      addedMemberIds: newMembers,
    });
    res.json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in addMembers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function removeMember(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!isAdmin(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can remove members." });
    }

    const targetId = id(req.params.userId || req.body.userId);
    if (id(req.userId) === targetId) {
      return res.status(400).json({ message: "Use leave group to remove yourself." });
    }

    if (!isMember(group, targetId)) {
      return res.status(400).json({ message: "User is not a member of this group." });
    }

    if (isAdmin(group, targetId) && group.admins.length === 1) {
      return res.status(400).json({
        message: "Cannot remove the only admin. Promote another member first.",
      });
    }

    group.members = group.members.filter((m) => id(m) !== targetId);
    group.admins = group.admins.filter((a) => id(a) !== targetId);
    // E2EE: rotate the key atomically so the removed member cannot read
    // messages sent after their removal.
    const rotation = validateKeyRotation(group, req.body.keyRotation, group.members);
    if (!rotation.ok) {
      return res.status(rotation.conflict ? 409 : 400).json({ message: rotation.message, keyVersion: group.keyVersion || 0 });
    }
    if (rotation.apply) await applyKeyRotation(group, rotation);
    else pruneKeyWraps(group);
    await group.save();

    const result = await populate(Group.findById(group._id));
    broadcastToGroup(result, "group:member-removed", {
      group: sanitizeGroup(result),
      removedUserId: targetId,
    });

    const removedSocketIds = getReceiverSocketId(targetId);
    removedSocketIds.forEach((socketId) =>
      io.to(socketId).emit("group:removed", {
        groupId: group._id,
      })
    );

    res.json({ removed: true, group: sanitizeGroup(result) });
  } catch (error) {
    console.log("Error in removeMember:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function leaveGroup(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });

    if (isAdmin(group, req.userId) && group.admins.length === 1) {
      return res.status(400).json({ message: "Assign another admin before leaving." });
    }

    group.members = group.members.filter((member) => id(member) !== id(req.userId));
    group.admins = group.admins.filter((admin) => id(admin) !== id(req.userId));
    // E2EE: best-effort rotation so the leaver cannot read later messages.
    // If the leaver's client never synced the key, the next sender rotates lazily.
    const rotation = validateKeyRotation(group, req.body.keyRotation, group.members);
    if (rotation.ok && rotation.apply) await applyKeyRotation(group, rotation);
    else pruneKeyWraps(group);
    await group.save();

    const result = await populate(Group.findById(group._id));
    broadcastToGroup(result, "group:member-left", {
      group: sanitizeGroup(result),
      leftUserId: id(req.userId),
    });

    const leftSocketIds = getReceiverSocketId(req.userId);
    leftSocketIds.forEach((socketId) =>
      io.to(socketId).emit("group:left", {
        groupId: group._id,
      })
    );

    res.json({ left: true, group: sanitizeGroup(result) });
  } catch (error) {
    console.log("Error in leaveGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function promoteAdmin(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!isAdmin(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can promote members." });
    }

    const targetId = id(req.params.userId || req.body.userId);
    if (!isMember(group, targetId)) {
      return res.status(400).json({ message: "User is not a member of this group." });
    }
    if (isAdmin(group, targetId)) {
      return res.status(400).json({ message: "User is already an admin." });
    }

    group.admins = [...group.admins, targetId];
    await group.save();

    const result = await populate(Group.findById(group._id));
    broadcastToGroup(result, "group:admin-updated", {
      group: sanitizeGroup(result),
      adminId: targetId,
      promoted: true,
    });

    res.json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in promoteAdmin:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function demoteAdmin(req, res) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      members: req.userId,
    });
    if (!group) return res.status(404).json({ message: "Group not found." });
    if (!isAdmin(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can demote admins." });
    }

    const targetId = id(req.params.userId || req.body.userId);
    if (id(req.userId) === targetId && group.admins.length === 1) {
      return res.status(400).json({
        message: "You are the only admin. Promote another member before demoting yourself.",
      });
    }
    if (!isAdmin(group, targetId)) {
      return res.status(400).json({ message: "User is not an admin." });
    }

    group.admins = group.admins.filter((a) => id(a) !== targetId);
    await group.save();

    const result = await populate(Group.findById(group._id));
    broadcastToGroup(result, "group:admin-updated", {
      group: sanitizeGroup(result),
      adminId: targetId,
      promoted: false,
    });

    res.json(sanitizeGroup(result));
  } catch (error) {
    console.log("Error in demoteAdmin:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
