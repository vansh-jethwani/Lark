export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfLocalDay(date) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

export function getMessageDateKey(date) {
  const localDate = startOfLocalDay(date);
  return localDate.toISOString();
}

export function formatMessageDate(date) {
  const messageDay = startOfLocalDay(date);
  const today = startOfLocalDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (messageDay.getTime() === today.getTime()) return "Today";
  if (messageDay.getTime() === yesterday.getTime()) return "Yesterday";
  if (messageDay.getTime() === tomorrow.getTime()) return "Tomorrow";

  return messageDay.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: messageDay.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
