import webpush from "web-push";
import User from "../models/user.model.js";

const MAX_PREVIEW_LENGTH = 140;

function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

function messagePreview(message) {
  if (message.image) return "📷 Photo";
  if (message.video) return "🎥 Video";
  if (message.audio) return "🎵 Voice message";
  if (message.file) return "📎 File";
  const text = String(message.text || "").trim();
  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…` : text || "New message";
}

async function removeInvalidSubscription(userId, endpoint) {
  await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint } } });
}

export async function sendPushToUser(userId, payload) {
  if (!configureWebPush()) return { sent: 0, skipped: "not-configured" };

  const user = await User.findById(userId).select("pushSubscriptions").lean();
  if (!user?.pushSubscriptions?.length) return { sent: 0, skipped: "no-subscriptions" };

  const subscriptions = [...new Map(user.pushSubscriptions.map((subscription) => [subscription.endpoint, subscription])).values()];
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification(subscription, body, { TTL: payload.ttl || 60 })));

  await Promise.all(results.map((result, index) => {
    const statusCode = result.reason?.statusCode;
    return result.status === "rejected" && (statusCode === 404 || statusCode === 410)
      ? removeInvalidSubscription(userId, subscriptions[index].endpoint)
      : null;
  }));

  return { sent: results.filter((result) => result.status === "fulfilled").length };
}

export async function sendMessageNotification({ receiverId, sender, message }) {
  return sendPushToUser(receiverId, {
    type: "message",
    title: sender.fullName || "New message",
    body: messagePreview(message),
    icon: sender.profilePic || "/logo.png",
    tag: `message:${message._id}`,
    timestamp: new Date(message.createdAt || Date.now()).getTime(),
    data: { senderId: String(sender._id), conversationId: String(sender._id), messageId: String(message._id) },
    actions: [{ action: "reply", title: "Reply" }, { action: "mark-read", title: "Mark as read" }],
  });
}

export async function sendIncomingCallNotification({ receiverId, caller, callId, callType }) {
  return sendPushToUser(receiverId, {
    type: "call",
    title: caller.fullName || "Incoming call",
    body: `Incoming ${callType === "video" ? "video" : "audio"} call`,
    icon: caller.profilePic || "/logo.png",
    tag: `call:${callId}`,
    requireInteraction: true,
    renotify: true,
    vibrate: [180, 80, 180, 80, 360],
    ttl: 30,
    data: { senderId: String(caller._id), conversationId: String(caller._id), callId, callType },
    actions: [{ action: "decline", title: "Decline" }, { action: "accept", title: "Accept" }],
  });
}

export function getPublicVapidKey() {
  return isPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}
