import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useSelectedConversation } from "../hooks/useSelectedConversation";
import { useEffect } from "react";
import ChatSidebar from "../components/chat/ChatSidebar";
import { ChatHeader } from "../components/chat/ChatHeader";
import { MessageList } from "../components/chat/MessageList";
import { ChatComposer } from "../components/chat/ChatComposer";

import { AI_USER_ID } from "../data/aiUser";

function ChatPage() {
  const getConversations = useChatStore((state) => state.getConversations);
  const getMessages = useChatStore((state) => state.getMessages);
  const getUsers = useChatStore((state) => state.getUsers);
  const subscribeToChatEvents = useChatStore((state) => state.subscribeToChatEvents);
  const unsubscribeFromMessages = useChatStore((state) => state.unsubscribeFromMessages);
  const socket = useAuthStore((state) => state.socket);

  const { activeConversation, activeConversationId, isLargeScreen } =
    useSelectedConversation();

  useEffect(() => {
    getUsers();
    getConversations();
  }, [getConversations, getUsers]);

  useEffect(() => {
    if (!activeConversationId) return;
    getMessages(activeConversationId);
  }, [getMessages, activeConversationId]);

  useEffect(() => {
    if (!socket) return;

    subscribeToChatEvents();

    return () => unsubscribeFromMessages();
  }, [socket, subscribeToChatEvents, unsubscribeFromMessages]);

  return (
    <div className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <ChatSidebar />

        <main
          className={`flex-1 flex-col overflow-hidden bg-background ${
            !isLargeScreen && !activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          <ChatHeader />
          <MessageList />
          {activeConversation ? <ChatComposer /> : null}
        </main>
      </div>
    </div>
  );
}

export default ChatPage;