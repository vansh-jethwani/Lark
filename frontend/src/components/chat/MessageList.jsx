import { useEffect, useRef, useState } from "react";

import useScrollToBottom from "../../hooks/useScrollToBottom";
import { MessageBubble } from "./MessageBubble";
import { NoConversationPlaceholder } from "./NoConversationPlaceholder";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { AI_USER_ID } from "../../data/aiUser";
import { TypingIndicator } from "./TypingIndicator";
import { useChatStore } from "../../store/useChatStore";
import { PinnedMessageBanner } from "./PinnedMessageBanner";
import { PinnedMessagesModal } from "./PinnedMessagesModal";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { SelectionBar } from "./SelectionBar";

export function MessageList() {
  const { activeConversation, activeConversationId } = useSelectedConversation();
  const [highlightedMessage, setHighlightedMessage] = useState(null);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [hiddenPinnedBannerConversationIds, setHiddenPinnedBannerConversationIds] = useState([]);
  const [pinnedModalOpen, setPinnedModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionConversationId, setSelectionConversationId] = useState(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const highlightTimeoutRef = useRef(null);

  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const deleteMessages = useChatStore((state) => state.deleteMessages);

  const lastMessageId = activeConversation?.messages.at(-1)?.id;
  const messagesScrollRef = useScrollToBottom(activeConversationId, lastMessageId);
  const pinnedMessages =
    activeConversation?.messages
      .filter((message) => message.isPinned)
      .sort((a, b) => new Date(a.pinnedAt || 0) - new Date(b.pinnedAt || 0)) || [];
  const pinnedTotal = pinnedMessages.length;
  const safePinnedIndex = pinnedTotal > 0 ? Math.min(currentPinnedIndex, pinnedTotal - 1) : 0;
  const currentPinnedMessage = pinnedMessages[safePinnedIndex];
  const showPinnedBanner =
    pinnedTotal > 0 && !hiddenPinnedBannerConversationIds.includes(activeConversationId);
  const isSelectionActive = selectionMode && selectionConversationId === activeConversationId;
  const selectableMessages = activeConversation?.messages || [];
  const selectedMessages = selectableMessages.filter((message) =>
    isSelectionActive && selectedMessageIds.includes(message.id),
  );
  const canDeleteForEveryone =
    selectedMessages.length > 0 && selectedMessages.every((message) => message.role === "me");

  useEffect(() => {
    clearTimeout(highlightTimeoutRef.current);

    return () => clearTimeout(highlightTimeoutRef.current);
  }, [activeConversationId]);

  useEffect(() => {
    if (!isSelectionActive) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectionMode(false);
        setSelectedMessageIds([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionActive]);

  const handleJumpToMessage = (messageId) => {
    if (!messageId) return;

    const target = messagesScrollRef.current?.querySelector(
      `[data-message-id="${messageId}"]`,
    );

    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessage({ conversationId: activeConversationId, messageId });
    clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessage(null);
    }, 1600);
  };

  const goToPinnedMessage = (index) => {
    if (pinnedTotal === 0) return;
    const nextIndex = (index + pinnedTotal) % pinnedTotal;
    setCurrentPinnedIndex(nextIndex);
    handleJumpToMessage(pinnedMessages[nextIndex]?.id);
  };

  const handlePinnedModalSelect = (messageId) => {
    const nextIndex = pinnedMessages.findIndex((message) => message.id === messageId);
    if (nextIndex >= 0) setCurrentPinnedIndex(nextIndex);
    setPinnedModalOpen(false);
    handleJumpToMessage(messageId);
  };

  const startSelection = (messageId) => {
    setSelectionConversationId(activeConversationId);
    setSelectionMode(true);
    setSelectedMessageIds(messageId ? [messageId] : []);
  };

  const toggleSelectedMessage = (messageId) => {
    setSelectedMessageIds((current) => {
      const next = current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId];

      if (next.length === 0) setSelectionMode(false);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedMessageIds((current) =>
      current.length === selectableMessages.length
        ? []
        : selectableMessages.map((message) => message.id),
    );
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectionConversationId(null);
    setSelectedMessageIds([]);
    setDeleteModalOpen(false);
    setForwardModalOpen(false);
  };

  const handleDeleteSelected = async (type) => {
    const didDelete = await deleteMessages(selectedMessageIds, type);
    if (didDelete) cancelSelection();
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {activeConversation ? (
        <div
          ref={messagesScrollRef}
          className={`flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4 ${
            isSelectionActive ? "pb-24" : ""
          }`}
        >
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
            Today
          </p>

          {showPinnedBanner ? (
            <PinnedMessageBanner
              message={currentPinnedMessage}
              currentIndex={safePinnedIndex}
              total={pinnedTotal}
              onPrevious={() => goToPinnedMessage(safePinnedIndex - 1)}
              onNext={() => goToPinnedMessage(safePinnedIndex + 1)}
              onOpenAll={() => setPinnedModalOpen(true)}
              onHide={() =>
                setHiddenPinnedBannerConversationIds((conversationIds) =>
                  conversationIds.includes(activeConversationId)
                    ? conversationIds
                    : [...conversationIds, activeConversationId],
                )
              }
              onJump={() => handleJumpToMessage(currentPinnedMessage?.id)}
            />
          ) : null}

          {activeConversation.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isHighlighted={
                highlightedMessage?.conversationId === activeConversationId &&
                highlightedMessage?.messageId === message.id
              }
              isSelectionMode={isSelectionActive}
              isSelected={isSelectionActive && selectedMessageIds.includes(message.id)}
              onJumpToMessage={handleJumpToMessage}
              onToggleSelected={toggleSelectedMessage}
              onStartSelection={startSelection}
            />
          ))}

          {activeConversationId === AI_USER_ID && isAIThinking ? (
            <TypingIndicator label="Lark AI is thinking" />
          ) : null}

          {activeConversationId !== AI_USER_ID && typingUsers?.[activeConversationId] ? (
            <TypingIndicator label="Typing" />
          ) : null}

          <PinnedMessagesModal
            isOpen={pinnedModalOpen}
            messages={pinnedMessages}
            onClose={() => setPinnedModalOpen(false)}
            onSelectMessage={handlePinnedModalSelect}
          />

          <DeleteMessageModal
            isOpen={isSelectionActive && deleteModalOpen}
            isOwnMessage={canDeleteForEveryone}
            onClose={() => setDeleteModalOpen(false)}
            onDeleteForMe={() => handleDeleteSelected("me")}
            onDeleteForEveryone={() => handleDeleteSelected("everyone")}
          />

          <ForwardMessageModal
            isOpen={isSelectionActive && forwardModalOpen}
            messages={selectedMessages}
            onClose={() => setForwardModalOpen(false)}
            onForwardComplete={cancelSelection}
          />
        </div>
      ) : (
        <NoConversationPlaceholder />
      )}

      {activeConversation && isSelectionActive ? (
        <SelectionBar
          selectedCount={selectedMessageIds.length}
          totalCount={selectableMessages.length}
          onSelectAll={toggleSelectAll}
          onDelete={() => setDeleteModalOpen(true)}
          onForward={() => setForwardModalOpen(true)}
          onCancel={cancelSelection}
        />
      ) : null}
    </div>
  );
}
