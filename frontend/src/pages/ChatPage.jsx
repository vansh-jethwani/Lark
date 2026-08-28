import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useSelectedConversation } from "../hooks/useSelectedConversation";
import { useEffect, useState } from "react";
import ChatSidebar from "../components/chat/ChatSidebar";
import { ChatHeader } from "../components/chat/ChatHeader";
import { MessageList } from "../components/chat/MessageList";
import { ChatComposer } from "../components/chat/ChatComposer";
import { CallPanel } from "../components/chat/CallPanel";
import { ChatInfoPage } from "../components/chat/ChatInfoPage";
import { useMatch } from "react-router";

function ChatPage() {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("lark-sidebar-width")) || 288);
  const [isResizing, setIsResizing] = useState(false);
  const getConversations = useChatStore((state) => state.getConversations);
  const getMessages = useChatStore((state) => state.getMessages);
  const getUsers = useChatStore((state) => state.getUsers);
  const isConversationsLoading = useChatStore((state) => state.isConversationsLoading);
  const subscribeToChatEvents = useChatStore((state) => state.subscribeToChatEvents);
  const unsubscribeFromMessages = useChatStore((state) => state.unsubscribeFromMessages);
  const socket = useAuthStore((state) => state.socket);

  const { activeConversation, activeConversationId, isLargeScreen } =
    useSelectedConversation();
  const infoRoute = useMatch("/chat/:conversationId/info");

  useEffect(() => {
    if (!isResizing) return undefined;
    const handlePointerMove = (event) => {
      setSidebarWidth(Math.min(440, Math.max(240, event.clientX)));
    };
    const handlePointerUp = () => setIsResizing(false);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem("lark-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    getUsers();
    getConversations();
  }, [getConversations, getUsers]);

  useEffect(() => {
    if (!activeConversationId || isConversationsLoading) return;
    getMessages(activeConversationId);
  }, [getMessages, activeConversationId, isConversationsLoading]);

  useEffect(() => {
    if (!socket) return;

    subscribeToChatEvents();

    return () => unsubscribeFromMessages();
  }, [socket, subscribeToChatEvents, unsubscribeFromMessages]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <ChatSidebar width={`${sidebarWidth}px`} />
        {isLargeScreen ? <button type="button" aria-label="Resize sidebar" title="Resize sidebar" onPointerDown={() => setIsResizing(true)} className="group hidden w-1 shrink-0 cursor-col-resize border-r border-border bg-transparent transition-colors hover:bg-primary/50 focus-visible:bg-primary/50 lg:block"><span className="mx-auto block h-10 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary" /></button> : null}
        <CallPanel />

        <main
          className={`relative min-w-0 flex-1 flex-col overflow-hidden bg-background ${
            !isLargeScreen && !activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          <ChatHeader />
          <MessageList />
          {activeConversation ? <ChatComposer /> : null}
        </main>
        {infoRoute ? (
          <aside className="absolute inset-y-0 right-0 z-40 w-full border-l border-border bg-background shadow-2xl lg:w-[min(36rem,38vw)]">
            <ChatInfoPage />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default ChatPage;
