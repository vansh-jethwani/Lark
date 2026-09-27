// Pure helpers for disappearing messages. Kept side-effect free so they can
// be unit-tested without a database connection.

export const ALLOWED_DISAPPEARING_DURATIONS = [0, 86400, 604800]; // off, 24h, 7d

export function isValidDisappearingDuration(duration) {
  return ALLOWED_DISAPPEARING_DURATIONS.includes(Number(duration));
}

// Returns the Date a message sent now should expire at, or null when the
// timer is off.
export function expiryDateFor(durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!seconds || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

// Mongo filter fragment that hides expired disappearing messages from reads.
// Used by every message read path so content never leaks even if the cleanup
// cron hasn't physically deleted the documents yet.
export function notExpiredFilter(now = new Date()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

// Canonical key for a direct-message conversation between two users,
// independent of argument order. DM settings (e.g. the disappearing timer)
// are stored under this key because DMs have no conversation document.
export function dmSettingKey(userIdA, userIdB) {
  const [first, second] = [String(userIdA), String(userIdB)].sort();
  return `dm:${first}_${second}`;
}
