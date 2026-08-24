import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

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
import { formatMessageDate, getMessageDateKey } from "../../lib/utils";
import { CallMessage } from "./CallPanel";
import { mergeCallHistory, normalizeCallRecord, readCallHistory } from "../../lib/callHistory";
import { axiosInstance } from "../../lib/axios";
import { useAuthStore } from "../../store/useAuthStore";

export function MessageList() {
  const { activeConversation, activeConversationId } = useSelectedConversation();
  const authUser = useAuthStore((state) => state.authUser);
  const [callHistory, setCallHistory] = useState(() => readCallHistory());
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
  const messageSearchQuery = useChatStore((state) => state.messageSearchQuery);
  const normalizedMessageSearchQuery = messageSearchQuery.trim().toLowerCase();

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
  const timeline = useMemo(() => {
    if (!activeConversation) return [];
    const calls = callHistory
      .filter((entry) => String(entry.peerId) === String(activeConversationId))
      .map((entry) => ({ ...entry, timelineType: "call" }));
    return [...activeConversation.messages.map((message) => ({ ...message, timelineType: "message" })), ...calls]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [activeConversation, activeConversationId, callHistory]);
  const isSelectionActive = selectionMode && selectionConversationId === activeConversationId;
  const selectableMessages = activeConversation?.messages || [];
  const selectableTimeline = timeline;
  const selectedMessages = selectableMessages.filter((message) =>
    isSelectionActive && selectedMessageIds.includes(message.id),
  );
  const selectedCalls = selectableTimeline.filter((item) =>
    isSelectionActive && item.timelineType === "call" && selectedMessageIds.includes(item.id),
  );
  const canDeleteForEveryone =
    selectedMessages.length > 0 && selectedMessages.every((message) => message.role === "me");
  const searchMatches = normalizedMessageSearchQuery
    ? selectableMessages.filter((message) =>
        String(message.text || "").toLowerCase().includes(normalizedMessageSearchQuery),
      )
    : [];
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const currentSearchMatch = searchMatches[currentSearchIndex];
  useEffect(() => {
    const refresh = () => setCallHistory((current) => mergeCallHistory(current, readCallHistory()));
    window.addEventListener("lark:call-history", refresh);
    return () => window.removeEventListener("lark:call-history", refresh);
  }, []);

  useEffect(() => {
    if (!authUser?._id) return undefined;
    axiosInstance.get("/auth/calls")
      .then((response) => setCallHistory((current) => mergeCallHistory(current, response.data.map((record) => normalizeCallRecord(record, authUser._id)))))
      .catch(() => {});
    return undefined;
  }, [authUser?._id]);

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

  const goToSearchMatch = (index) => {
    if (searchMatches.length === 0) return;
    const nextIndex = (index + searchMatches.length) % searchMatches.length;
    setCurrentSearchIndex(nextIndex);
    handleJumpToMessage(searchMatches[nextIndex].id);
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
      current.length === selectableTimeline.length
        ? []
        : selectableTimeline.map((item) => item.id),
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
    const callIds = selectedCalls.map((call) => call.id);
    const messageIds = selectedMessageIds.filter((id) => !callIds.includes(id));
    const callEntries = selectedCalls.filter((call) => call.serverId);
    await Promise.all(callEntries.map((call) => axiosInstance.delete(`/auth/calls/${call.serverId}`).catch(() => null)));
    if (callIds.length) {
      setCallHistory((current) => current.filter((entry) => !callIds.includes(entry.id)));
      const localHistory = readCallHistory().filter((entry) => !callIds.includes(entry.id));
      localStorage.setItem("lark-call-history", JSON.stringify(localHistory));
      window.dispatchEvent(new Event("lark:call-history"));
    }
    const didDelete = messageIds.length ? await deleteMessages(messageIds, type) : true;
    if (didDelete) cancelSelection();
  };

  const handleDeleteRequest = () => {
    if (selectedCalls.length && !selectedMessages.length) {
      handleDeleteSelected("me");
      return;
    }
    setDeleteModalOpen(true);
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

          {normalizedMessageSearchQuery ? (
            <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-accent">
                {searchMatches.length
                  ? `${currentSearchIndex + 1}/${searchMatches.length} results`
                  : "No results"}
              </span>
              <button
                type="button"
                onClick={() => goToSearchMatch(currentSearchIndex - 1)}
                disabled={searchMatches.length === 0}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface disabled:opacity-40"
                aria-label="Previous search result"
              >
                <ChevronUpIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => goToSearchMatch(currentSearchIndex + 1)}
                disabled={searchMatches.length === 0}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface disabled:opacity-40"
                aria-label="Next search result"
              >
                <ChevronDownIcon className="size-4" />
              </button>
            </div>
          ) : null}

          {timeline.map((item, index) => {
            const currentDateKey = getMessageDateKey(item.createdAt);
            const previousDateKey =
              index > 0
                ? getMessageDateKey(timeline[index - 1].createdAt)
                : null;
            const shouldShowDate = currentDateKey !== previousDateKey;

            return (
              <div key={`${item.timelineType}-${item.id}`} className="contents">
                {shouldShowDate ? (
                  <p className="mb-3 mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted first:mt-0">
                    {formatMessageDate(item.createdAt)}
                  </p>
                ) : null}
                {item.timelineType === "call" ? <CallMessage entry={item} isSelectionMode={isSelectionActive} isSelected={isSelectionActive && selectedMessageIds.includes(item.id)} onToggleSelected={toggleSelectedMessage} onStartSelection={startSelection} /> : <MessageBubble
                    message={item}
                    isHighlighted={(highlightedMessage?.conversationId === activeConversationId && highlightedMessage?.messageId === item.id) || currentSearchMatch?.id === item.id}
                    searchQuery={messageSearchQuery}
                    isSelectionMode={isSelectionActive}
                    isSelected={isSelectionActive && selectedMessageIds.includes(item.id)}
                    onJumpToMessage={handleJumpToMessage}
                    onToggleSelected={toggleSelectedMessage}
                    onStartSelection={startSelection}
                  />}
              </div>
            );
          })}

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
          totalCount={selectableTimeline.length}
          onSelectAll={toggleSelectAll}
          onDelete={handleDeleteRequest}
          onForward={() => setForwardModalOpen(true)}
          canForward={selectedCalls.length === 0}
          onCancel={cancelSelection}
        />
      ) : null}
    </div>
  );
}
