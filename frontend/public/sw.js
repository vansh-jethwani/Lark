self.addEventListener("push", (event) => {
  const payload = event.data?.json?.();
  if (!payload) return;
  event.waitUntil(self.registration.showNotification(payload.title || "Lark", {
    body: payload.body, icon: payload.icon || "/logo.png", badge: "/favicon.png", tag: payload.tag,
    timestamp: payload.timestamp || Date.now(), data: payload.data || {}, actions: payload.actions || [],
    requireInteraction: Boolean(payload.requireInteraction), renotify: Boolean(payload.renotify), vibrate: payload.vibrate,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action || "open";
  const data = event.notification.data || {};
  const url = new URL("/", self.location.origin);
  Object.entries({ notificationAction: action, conversationId: data.conversationId, senderId: data.senderId, callId: data.callId, callType: data.callType }).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  event.waitUntil((async () => {
    const client = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))[0];
    if (client) { await client.focus(); client.postMessage({ type: "lark:notification-action", action, data }); return; }
    await self.clients.openWindow(url.href);
  })());
});
self.addEventListener("notificationclose", () => {});
