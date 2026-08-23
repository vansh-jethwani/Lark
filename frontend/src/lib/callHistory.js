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
