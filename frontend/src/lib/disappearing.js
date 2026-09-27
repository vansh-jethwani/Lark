// Shared disappearing-message timer options and labels (side-effect free,
// unit-tested with vitest).

export const DISAPPEARING_OPTIONS = [
  { value: 0, label: "Off", hint: "Messages never expire" },
  { value: 86400, label: "24 hours", hint: "New messages disappear after 24 hours" },
  { value: 604800, label: "7 days", hint: "New messages disappear after 7 days" },
];

export function formatDisappearingDuration(seconds) {
  if (seconds === 86400) return "24 hours";
  if (seconds === 604800) return "7 days";
  return "Off";
}
