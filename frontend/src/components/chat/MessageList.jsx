import useScrollToBottom from "../../hooks/useScrollToBottom";
import { MessageBubble } from "./MessageBubble";
import { NoConversationPlaceholder } from "./NoConversationPlaceholder";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { AI_USER_ID } from "../../data/aiUser";
import { TypingIndicator } from "./TypingIndicator";
import { useChatStore } from "../../store/useChatStore";

export function MessageList() {
  const { activeConversation, activeConversationId } = useSelectedConversation();

  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const typingUsers = useChatStore((state) => state.typingUsers);

  const lastMessageId = activeConversation?.messages.at(-1)?.id;
  const messagesScrollRef = useScrollToBottom(activeConversationId, lastMessageId);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {activeConversation ? (
        <div
          ref={messagesScrollRef}
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4"
        >
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
            Today
          </p>

          {activeConversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {activeConversationId === AI_USER_ID && isAIThinking ? (
            <TypingIndicator label="Lark AI is thinking" />
          ) : null}

          {activeConversationId !== AI_USER_ID && typingUsers?.[activeConversationId] ? (
            <TypingIndicator label="Typing" />
          ) : null}
        </div>
      ) : (
        <NoConversationPlaceholder />
      )}
    </div>
  );
}