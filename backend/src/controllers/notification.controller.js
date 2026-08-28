import Call from "../models/call.model.js";
import { getPublicVapidKey } from "../lib/notifications.js";

function validSubscription(subscription) {
  return subscription && typeof subscription.endpoint === "string" && subscription.endpoint.startsWith("https://")
    && typeof subscription.keys?.p256dh === "string" && typeof subscription.keys?.auth === "string";
}

export async function getVapidPublicKey(req, res) {
  const publicKey = getPublicVapidKey();
  if (!publicKey) return res.status(503).json({ message: "Push notifications are not configured." });
  return res.status(200).json({ publicKey });
}

export async function subscribe(req, res) {
  const subscription = req.body;
  if (!validSubscription(subscription)) return res.status(400).json({ message: "Invalid push subscription." });

  const next = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
  };
  await req.user.updateOne({ $pull: { pushSubscriptions: { endpoint: next.endpoint } } });
  await req.user.updateOne({ $push: { pushSubscriptions: { $each: [next], $slice: -10 } } });
  return res.status(201).json({ subscribed: true });
}

export async function unsubscribe(req, res) {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string") return res.status(400).json({ message: "Subscription endpoint is required." });
  await req.user.updateOne({ $pull: { pushSubscriptions: { endpoint } } });
  return res.status(204).end();
}

export async function getPendingCall(req, res) {
  const call = await Call.findOne({ callId: req.params.callId, receiver: req.userId, status: "ringing" })
    .populate("caller", "fullName profilePic");
  if (!call) return res.status(410).json({ message: "This call is no longer available." });
  return res.status(200).json({
    callId: call.callId,
    callType: call.type,
    caller: { _id: call.caller._id, fullName: call.caller.fullName, profilePic: call.caller.profilePic },
  });
}
