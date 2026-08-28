import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";

const populate = (query) =>
  query
    .populate("members", "fullName username profilePic email")
    .populate("admins", "_id fullName username profilePic")
    .populate("createdBy", "_id fullName username profilePic")
    .lean();

const id = (value) => String(value);

const isAdmin = (group, userId) =>
  group.admins.some((admin) => id(admin._id || admin) === id(userId));

const isMember = (group, userId) =>
  group.members.some((member) => id(member._id || member) === id(userId));

function sanitizeGroup(group) {
  if (!group) return null;
  return {
    _id: group._id,
    name: group.name,
    profilePic: group.profilePic,
    description: group.description,
    members: group.members,
    admins: group.admins,
    createdBy: group.createdBy,
    permissions: group.permissions,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
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
    const filter = { groupId: group._id, deletedFor: { $nin: [req.userId] } };
    if (req.query.paginated !== "true") {
      const messages = await Message.find(filter).populate("senderId", "fullName username profilePic")
        .populate("replyTo", "text image video audio file fileName senderId").sort({ createdAt: 1 });
      return res.json(messages);
    }
    const { limit, before } = getPageOptions(req);
    if (before) filter.$and = [{ $or: [{ createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before.id } }] }];
    const page = await Message.find(filter).populate("senderId", "fullName username profilePic")
      .populate("replyTo", "text image video audio file fileName senderId").sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
    const hasMore = page.length > limit;
    const messages = (hasMore ? page.slice(0, limit) : page).reverse();
    res.json({ messages, hasMore, nextCursor: hasMore ? makeCursor(messages[0]) : null });
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
    if (!text && !mediaFile) return res.status(400).json({ message: "Message text or media is required." });
    let media = {};
    if (mediaFile) {
      if (!hasImagekitConfig()) return res.status(503).json({ message: "Media upload is not configured." });
      const url = await uploadChatMedia(mediaFile);
      const kind = mediaFile.mimetype.startsWith("image") ? "image" : mediaFile.mimetype.startsWith("video") ? "video" : mediaFile.mimetype.startsWith("audio") ? "audio" : "file";
      media = { [kind]: url, fileName: mediaFile.originalname, fileType: mediaFile.mimetype, fileSize: mediaFile.size };
    }
    const message = await Message.create({ senderId: req.userId, groupId: group._id, text, replyTo: req.body.replyTo || null, ...media });
    const populated = await Message.findById(message._id)
      .populate("senderId", "fullName username profilePic")
      .populate("replyTo", "text image video audio file fileName senderId");
    const sockets = groupSocketIds(group);
    if (sockets.length) io.to(sockets).emit("newMessage", populated);
    await Group.updateOne({ _id: group._id }, { $set: { updatedAt: new Date() } });
    res.status(201).json(populated);
  } catch (error) {
    console.log("Error in sendGroupMessage:", error.message);
    res.status(500).json({ message: "Failed to send group message." });
  }
}

export async function getGroupMedia(req, res) {
  try {
    const group = await findMemberGroup(req.params.id, req.userId);
    if (!group) return res.status(404).json({ message: "Group not found." });
    const messages = await Message.find({ groupId: group._id, deletedFor: { $nin: [req.userId] }, $or: [{ image: { $ne: "" } }, { video: { $ne: "" } }, { audio: { $ne: "" } }, { file: { $ne: "" } }] })
      .select("image video audio file fileName fileType fileSize senderId createdAt").sort({ createdAt: -1 }).limit(60);
    res.json(messages);
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

    const users = await User.find({ _id: { $in: memberIds } }).select("_id");
    if (users.length !== memberIds.length) {
      return res.status(400).json({ message: "One or more members are invalid." });
    }

    const members = [...new Set([id(req.userId), ...memberIds])];
    const group = await Group.create({
      name,
      profilePic: req.body.profilePic || "",
      description: req.body.description || "",
      members,
      admins: [req.userId],
      createdBy: req.userId,
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
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        const value = String(req.body[key]).trim().toLowerCase();
        if (value !== "admins" && value !== "members") {
          return res.status(400).json({ message: `Invalid permission value for ${key}.` });
        }
        group.permissions[key] = value;
      }
    });

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

    group.members = [...group.members, ...newMembers];
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
