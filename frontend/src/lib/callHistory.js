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
  const startedAt = record.startedAt || record.createdAt;
  const duration = Number(record.duration) || (record.answeredAt && record.endedAt
    ? Math.max(0, Math.floor((new Date(record.endedAt) - new Date(record.answeredAt)) / 1000))
    : 0);
  return {
    id: record._id || record.id,
    callId: record.callId,
    peerId: peer?._id || peer,
    peerName: peer?.fullName || record.peerName || "Unknown user",
    peerAvatar: peer?.profilePic || record.peerAvatar || "",
    type: record.type,
    direction: outgoing ? "outgoing" : "incoming",
    status: record.status || "unknown",
    duration,
    createdAt: startedAt,
  };
}

export function groupCallHistory(history) {
  const groups = new Map();
  for (const entry of history) {
    if (!entry?.peerId || !entry.createdAt) continue;
    const key = `${entry.peerId}:${localDateKey(entry.createdAt)}`;
    const group = groups.get(key) || { key, peerId: entry.peerId, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const entries = [...group.entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { ...group, entries, latest: entries[0] };
    })
    .sort((a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt));
}

export function callStatusLabel(status) {
  return {
    completed: "Completed",
    accepted: "Completed",
    rejected: "Rejected",
    missed: "Missed",
    cancelled: "Cancelled",
    failed: "Failed",
    ringing: "Unknown",
  }[status] || "Unknown";
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
