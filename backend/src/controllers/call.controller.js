import Call from "../models/call.model.js";

export async function getCallHistory(req, res) {
  try {
    const calls = await Call.find({ $or: [{ caller: req.userId }, { receiver: req.userId }] })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("caller", "fullName profilePic")
      .populate("receiver", "fullName profilePic");
    return res.status(200).json(calls);
  } catch (error) {
    console.error("Error in getCallHistory:", error.message);
    return res.status(500).json({ message: "Unable to load call history" });
  }
}
