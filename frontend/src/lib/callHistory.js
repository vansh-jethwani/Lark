const CALL_HISTORY_KEY = "lark-call-history";

export function readCallHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function addCallHistory(entry) {
  const history = readCallHistory();
  const next = { ...entry, id: entry.id || crypto.randomUUID(), createdAt: entry.createdAt || new Date().toISOString() };
  localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify([next, ...history].slice(0, 100)));
  window.dispatchEvent(new Event("lark:call-history"));
  return next;
}

export function formatCallDuration(seconds = 0) {
  const value = Number(seconds) || 0;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function normalizeCallRecord(record, currentUserId) {
  const callerId = record.caller?._id || record.caller;
  const outgoing = String(currentUserId) === String(callerId);
  const peer = outgoing ? record.receiver : record.caller;
  return {
    id: record._id || record.id,
    callId: record.callId,
    peerId: peer?._id || peer,
    peerName: peer?.fullName || record.peerName || "Unknown user",
    peerAvatar: peer?.profilePic || record.peerAvatar || "",
    type: record.type,
    direction: outgoing ? "outgoing" : "incoming",
    status: record.status,
    duration: record.duration || 0,
    createdAt: record.createdAt || record.startedAt,
  };
}

export function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dateLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (localDateKey(date) === localDateKey(today)) return "Today";
  if (localDateKey(date) === localDateKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function timeLabel(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}
