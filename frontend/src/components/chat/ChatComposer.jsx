import { Button, TextArea } from "@heroui/react";
import { PaperclipIcon, LoaderIcon, SendHorizontalIcon } from "lucide-react";
import { useRef } from "react";
import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { AI_USER_ID } from "../../data/aiUser";
import { ReplyPreview } from "./ReplyPreview";

export function ChatComposer() {
  const composerText = useChatStore((state) => state.composerText);
  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);
  const isSendingMedia = useChatStore((state) => state.isSendingMedia);
  const sendTextMessage = useChatStore((state) => state.sendTextMessage);
  const setComposerText = useChatStore((state) => state.setComposerText);
  const sendAIMessage = useChatStore((state) => state.sendAIMessage);
  const { activeConversationId } = useSelectedConversation();
  const mediaInputRef = useRef(null);
  const sendTypingStatus = useChatStore((state) => state.sendTypingStatus);
  const typingTimeoutRef = useRef(null);
  const { replyingTo, clearReplyingTo } = useChatStore();


  const handleSend = async () => {
    if (activeConversationId !== AI_USER_ID) {
  sendTypingStatus(activeConversationId, false);
}
    if (activeConversationId === AI_USER_ID) {
      await sendAIMessage();
      return;
    }

    await sendTextMessage(activeConversationId);
  };

  const handleComposerTextChange = (event) => {
    setComposerText(event.target.value);
    if (activeConversationId !== AI_USER_ID) {
  sendTypingStatus(activeConversationId, true);

  clearTimeout(typingTimeoutRef.current);

  typingTimeoutRef.current = setTimeout(() => {
    sendTypingStatus(activeConversationId, false);
  }, 1200);
}
  };

  const handleMediaPick = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  if (activeConversationId === AI_USER_ID) {
    await sendAIMessage({ file });
    return;
  }

  await sendMediaMessage({
    conversationId: activeConversationId,
    file,
  });
};

  return (
    <footer className="shrink-0 border-t border-border px-1.5 pb-2 pt-2 sm:px-2">
      <ReplyPreview message={replyingTo} onClose={clearReplyingTo} />
      {isSendingMedia ? (
        <div className="mx-auto mb-2 flex max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
          <LoaderIcon
            className="size-4 shrink-0 animate-spin text-accent"
            strokeWidth={2}
            aria-hidden
          />
          <span className="truncate">Uploading media...</span>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-full items-end gap-1.5 px-0.5 sm:gap-2 sm:px-1">
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv"
          className="sr-only"
          disabled={isSendingMedia}
          tabIndex={-1}
          aria-hidden
          onChange={handleMediaPick}
        />
        <Button
          variant="ghost"
          isIconOnly
          isDisabled={isSendingMedia}
          className="size-9 shrink-0 touch-manipulation self-end text-accent"
          onPress={() => mediaInputRef.current?.click()}
        >
          <PaperclipIcon className="size-5 sm:size-6" strokeWidth={2} />
        </Button>
        <TextArea
          fullWidth
          variant="secondary"
          placeholder="Send a message..."
          rows={1}
          value={composerText}
          onChange={handleComposerTextChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 rounded-full"
        />

        <Button variant="primary" isIconOnly isDisabled={!composerText.trim()} onPress={handleSend}>
          <SendHorizontalIcon className="size-5" />
        </Button>
      </div>
    </footer>
  );
}
