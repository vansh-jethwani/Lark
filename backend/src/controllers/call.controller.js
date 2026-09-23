import Call from "../models/call.model.js";
import { safeCache } from "../lib/redis.js";

export async function getCallHistory(req, res) {
  try {
    const cacheKey = `chat:calls:${req.userId}`;
    const cached = await safeCache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const calls = await Call.find({ $or: [{ caller: req.userId }, { receiver: req.userId }], deletedFor: { $ne: req.userId } })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("caller", "fullName profilePic")
      .populate("receiver", "fullName profilePic");

    await safeCache.setex(cacheKey, 120, calls);
    return res.status(200).json(calls);
  } catch (error) {
    console.error("Error in getCallHistory:", error.message);
    return res.status(500).json({ message: "Unable to load call history" });
  }
}

export async function deleteCallHistory(req, res) {
  try {
    const result = await Call.updateOne({
      _id: req.params.id,
      $or: [{ caller: req.userId }, { receiver: req.userId }],
      deletedFor: { $ne: req.userId },
    }, { $addToSet: { deletedFor: req.userId } });
    if (!result.modifiedCount) return res.status(404).json({ message: "Call record not found" });
    await safeCache.del(`chat:calls:${req.userId}`);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting call history:", error.message);
    return res.status(500).json({ message: "Unable to delete call record" });
  }
}
