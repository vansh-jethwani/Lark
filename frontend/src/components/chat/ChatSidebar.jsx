import {
  getInitials,
  useSelectedConversation,
} from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { APP_NAME, AppLogo } from "../AppLogo";
import { Avatar } from "@heroui/react";

import { SearchField, Tabs } from "@heroui/react";
import { MessageSquareIcon, PhoneIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router";
import { ConversationRow } from "./ConversationRow";
import { CallHistory } from "./CallPanel";
import { CreateGroupModal } from "./CreateGroupModal";
import { useEffect, useMemo, useState } from "react";

function getLastMessagePreview(message) {
  if (!message) return "";
  if (message.text) return message.text;
  if (message.image) return "Photo";
  if (message.video) return "Video";
  if (message.file) return message.fileName || "Document";
  return "";
}

function mapUserForList(user, onlineUsers) {
  const isGroup = user.type === "group";
  return {
    conversationId: user._id,
    id: user._id,
    name: isGroup ? user.name : user.fullName,
    email: user.email,
    username: user.username,
    avatarUrl: user.profilePic,
    initials: getInitials(isGroup ? user.name : user.fullName),
    isOnline: isGroup ? false : onlineUsers.includes(user._id),
    lastMessagePreview: getLastMessagePreview(user.lastMessage),
    lastMessageAt: user.lastMessageAt,
    unreadCount: Number(user.unreadCount || 0),
    peer: {
      name: isGroup ? user.name : user.fullName,
      avatarUrl: user.profilePic,
      initials: getInitials(user.fullName),
      isOnline: onlineUsers.includes(user._id),
    },
  };
}

function ChatSidebar({ width }) {
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const conversations = useChatStore((state) => state.conversations);
  const searchedUsers = useChatStore((state) => state.searchedUsers);
  const searchUsers = useChatStore((state) => state.searchUsers);
  const searchQuery = useChatStore((state) => state.searchQuery);
  const setSearchQuery = useChatStore((state) => state.setSearchQuery);
  const setMessageSearchQuery = useChatStore(
  (state) => state.setMessageSearchQuery
);

  const sidebarTab = useChatStore((state) => state.sidebarTab);
  const setSidebarTab = useChatStore((state) => state.setSidebarTab);

  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  );
  const openDirectChat = useChatStore((state) => state.openDirectChat);

  const onlineUsers = useAuthStore((state) => state.onlineUsers);
  const authUser = useAuthStore((state) => state.authUser);

  const { activeConversationId, isLargeScreen } = useSelectedConversation();

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  useEffect(() => {
    if (!normalizedSearchQuery) {
      searchUsers("");
      return undefined;
    }
    const timer = window.setTimeout(
      () => searchUsers(normalizedSearchQuery),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [normalizedSearchQuery, searchUsers]);

  const conversationUsers = conversations.map((user) =>
    mapUserForList(user, onlineUsers),
  );
  const filteredConversations = normalizedSearchQuery
    ? conversations
        .filter((user) =>
          (user.name || user.fullName || user.username || "")
            .toLowerCase()
            .includes(normalizedSearchQuery),
        )
        .map((user) => mapUserForList(user, onlineUsers))
    : conversationUsers;
  const searchResults = useMemo(() => {
    const seen = new Set(
      filteredConversations.map((conversation) => String(conversation.id)),
    );
    return [
      ...filteredConversations,
      ...searchedUsers
        .filter((user) => !seen.has(String(user._id)))
        .map((user) => mapUserForList(user, onlineUsers)),
    ];
  }, [filteredConversations, searchedUsers, onlineUsers]);

  return (
    <aside
      style={isLargeScreen && width ? { width } : undefined}
      className={`relative w-full shrink-0 flex-col overflow-hidden border-r border-border lg:w-auto ${
        !isLargeScreen && activeConversationId ? "hidden lg:flex" : "flex"
      }`}
    >
      <div className="shrink-0  px-2 pb-2 pt-2.5 sm:px-3 sm:pt-3">
        <div className="flex items-center gap-3 px-0.5 sm:gap-3 sm:px-1">
          <AppLogo
            size={34}
            className="size-9 shrink-0 rounded-lg"
            alt={APP_NAME}
          />

          <p className="flex-1 truncate text-lg font-bold tracking-tight sm:text-[22px]">
            {APP_NAME}
          </p>
          <Link to="/profile" aria-label="Profile & Settings">
            <Avatar className="size-8">
              <Avatar.Image
                alt={authUser?.fullName}
                src={authUser?.profilePic}
              />
              <Avatar.Fallback className="text-xs font-semibold">
                {getInitials(authUser?.fullName)}
              </Avatar.Fallback>
            </Avatar>
          </Link>
        </div>
      </div>

      <Tabs
        selectedKey={sidebarTab}
        onSelectionChange={(key) => setSidebarTab(String(key))}
        variant="secondary"
        className="flex flex-1 flex-col overflow-y-auto"
      >
        <div className="shrink-0  px-3 pb-2 pt-2">
          <SearchField
            fullWidth
            variant="secondary"
            className="w-full"
            value={searchQuery}
            onChange={setSearchQuery}
          >
            <SearchField.Group className="rounded-xl">
              <SearchField.SearchIcon />
              <SearchField.Input
                aria-label="Search users by username"
                placeholder="Search Username"
              />
              {searchQuery ? <SearchField.ClearButton /> : null}
            </SearchField.Group>
          </SearchField>
        </div>

        <Tabs.ListContainer className="shrink-0 border-0 px-0 pb-0 pt-1">
          <Tabs.List className="w-full gap-0.5 border-0">
            <Tabs.Tab
              id="chats"
              className="flex-1 justify-center gap-1.5 data-[selected=true]:text-accent data-[selected=true]:border-b-2 data-[selected=true]:border-accent"
            >
              <MessageSquareIcon className="size-3.5 opacity-80" aria-hidden />
              Chats
            </Tabs.Tab>
            <Tabs.Tab
              id="calls"
              className="flex-1 justify-center gap-1.5 data-[selected=true]:text-accent data-[selected=true]:border-b-2 data-[selected=true]:border-accent"
            >
              <PhoneIcon className="size-3.5 opacity-80" aria-hidden />
              Calls
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel
          id="chats"
          className="flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          {(normalizedSearchQuery ? searchResults : filteredConversations)
            .length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No conversations match your search.
            </p>
          ) : (
            (normalizedSearchQuery ? searchResults : filteredConversations).map(
              (conversation) => (
                <ConversationRow
                  key={conversation.id}
                  user={conversation}
                  selected={conversation.id === activeConversationId}
                  onSelect={() => {
                    setMessageSearchQuery("");

                    const remoteUser = searchedUsers.find(
                      (user) => String(user._id) === String(conversation.id),
                    );

                    if (
                      remoteUser &&
                      !conversations.some(
                        (item) => String(item._id) === String(conversation.id),
                      )
                    ) {
                      openDirectChat(remoteUser);
                    } else {
                      setActiveConversationId(conversation.id);
                    }
                  }}
                />
              ),
            )
          )}
        </Tabs.Panel>

        <Tabs.Panel
          id="calls"
          className="flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          <CallHistory />
        </Tabs.Panel>
      </Tabs>
      <button
        type="button"
        onClick={() => setCreateGroupOpen(true)}
        className="absolute bottom-4 right-4 z-20 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
        aria-label="Create group"
        title="Create group"
      >
        <PlusIcon className="size-6" strokeWidth={2.5} />
      </button>
      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />
    </aside>
  );
}
export default ChatSidebar;
