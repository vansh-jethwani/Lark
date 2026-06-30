import { Avatar, Button } from "@heroui/react";
import { ChevronLeftIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { AppLogo } from "../AppLogo";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

import { ThemePresetPicker } from "../ThemePresetPicker";

import { ThemeToggle } from "../ThemeToggle";

import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";

export function ChatHeader() {
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const messageSearchQuery = useChatStore((state) => state.messageSearchQuery);
  const setMessageSearchQuery = useChatStore((state) => state.setMessageSearchQuery);
  const [searchOpen, setSearchOpen] = useState(false);

  const { activeConversation, isLargeScreen } = useSelectedConversation();

  return (
    <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-1.5 py-1.5 sm:gap-2 sm:px-2 sm:py-2">
      {activeConversation && !isLargeScreen ? (
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          onPress={() => setActiveConversationId(null)}
        >
          <ChevronLeftIcon className="size-6" strokeWidth={2.25} />
        </Button>
      ) : null}

      {activeConversation ? (
        <>
          <AvatarWithOnlineIndicator isOnline={activeConversation.peer.isOnline ?? true}>
            <Avatar className="size-9 shrink-0">
              <Avatar.Image
                alt={activeConversation.peer.name}
                src={activeConversation.peer.avatarUrl}
              />
              <Avatar.Fallback className="text-sm font-medium">
                {activeConversation.peer.initials}
              </Avatar.Fallback>
            </Avatar>
          </AvatarWithOnlineIndicator>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="truncate text-[15px] font-semibold leading-tight">
              {activeConversation.peer.name}
            </p>
            <p className="truncate text-xs text-muted">
              {activeConversation.peer.isOnline ? (
                <span className="font-medium text-success">Online</span>
              ) : (
                "Offline"
              )}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2.5 sm:text-left">
          <AppLogo size={36} className="rounded-[9px]" />
          <div className="flex-1 text-center sm:text-left">
            <p className="truncate text-[13px] font-medium text-muted">Select a conversation</p>
          </div>
        </div>
      )}

      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1">
        <div className="hidden min-[400px]:contents">
          <ThemePresetPicker />
        </div>

        <ThemeToggle />

        {activeConversation ? (
          searchOpen ? (
            <div className="flex min-w-[180px] items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
              <SearchIcon className="size-4 shrink-0 text-muted" aria-hidden />
              <input
                value={messageSearchQuery}
                onChange={(event) => setMessageSearchQuery(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setMessageSearchQuery("");
                }}
                className="rounded-full p-1 text-muted hover:bg-background hover:text-foreground"
                aria-label="Close search"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0"
              aria-label="Search messages"
              onPress={() => setSearchOpen(true)}
            >
              <SearchIcon className="size-5" strokeWidth={2} aria-hidden />
            </Button>
          )
        ) : null}

        {activeConversation ? (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="shrink-0"
            aria-label="Close chat"
            onPress={() => setActiveConversationId(null)}
          >
            <XIcon className="size-5.5" strokeWidth={2} aria-hidden />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
