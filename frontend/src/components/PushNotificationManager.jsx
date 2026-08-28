import { useEffect } from "react";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";

function urlBase64ToUint8Array(value) { const padding = "=".repeat((4 - (value.length % 4)) % 4); const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }
async function subscribeToPush() { const registration = await navigator.serviceWorker.register("/sw.js"); const existing = await registration.pushManager.getSubscription(); if (existing) return existing; const { data } = await axiosInstance.get("/notifications/vapid-public-key"); return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) }); }
async function openConversation(data, action) { const chat = useChatStore.getState(); const conversationId = data.conversationId || data.senderId; if (!conversationId) return; await Promise.all([chat.getUsers(), chat.getConversations()]); useChatStore.getState().setActiveConversationId(conversationId); if (action === "mark-read") await useChatStore.getState().markConversationAsRead(conversationId); if (action === "reply") window.dispatchEvent(new Event("lark:focus-composer")); }
async function handleNotificationAction({ action, data }) { if (data.callId) { if (action === "accept" || action === "decline") { try { const detail = { action, call: (await axiosInstance.get(`/notifications/calls/${data.callId}`)).data }; window.__larkPendingCallAction = detail; window.dispatchEvent(new CustomEvent("lark:notification-call-action", { detail })); } catch { /* Expired calls are intentionally ignored. */ } } return; } await openConversation(data, action); }

export function PushNotificationManager({ enabled }) {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return undefined;
    const register = async () => { if (Notification.permission !== "granted") return; try { const subscription = await subscribeToPush(); await axiosInstance.post("/notifications/subscribe", subscription.toJSON()); } catch { /* Notifications are optional. */ } };
    const requestPermission = () => { if (Notification.permission === "default") Notification.requestPermission().then(register); };
    const onMessage = (event) => { if (event.data?.type === "lark:notification-action") handleNotificationAction(event.data); };
    const params = new URLSearchParams(window.location.search); const action = params.get("notificationAction");
    if (action) {
      handleNotificationAction({ action, data: { conversationId: params.get("conversationId"), senderId: params.get("senderId"), callId: params.get("callId"), callType: params.get("callType") } });
      window.history.replaceState({}, "", window.location.pathname);
    }
    navigator.serviceWorker.addEventListener("message", onMessage); register(); window.addEventListener("pointerdown", requestPermission, { once: true });
    return () => { navigator.serviceWorker.removeEventListener("message", onMessage); window.removeEventListener("pointerdown", requestPermission); };
  }, [enabled]);
  return null;
}
