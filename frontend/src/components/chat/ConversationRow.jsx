import { Avatar } from "@heroui/react";
import { formatMessageTime } from "../../lib/utils";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

export function ConversationRow({ user, selected, onSelect }) {
  const unreadCount = Number(user.unreadCount || 0);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left ${
        selected ? "bg-accent-soft" : ""
      }`}
    >
      <AvatarWithOnlineIndicator isOnline={user.isOnline ?? true}>
        <Avatar className="size-12 shrink-0">
          <Avatar.Image alt={user.name} src={user.avatarUrl} />
          <Avatar.Fallback className="text-sm font-medium">{user.initials}</Avatar.Fallback>
        </Avatar>
      </AvatarWithOnlineIndicator>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{user.name}</p>
          {user.lastMessageAt ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              {formatMessageTime(user.lastMessageAt)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex min-h-5 items-center gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-sm ${
              unreadCount > 0 ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            {user.lastMessagePreview || user.email || ""}
          </p>
          {unreadCount > 0 ? (
            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-success px-1.5 text-[11px] font-bold leading-5 text-success-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
