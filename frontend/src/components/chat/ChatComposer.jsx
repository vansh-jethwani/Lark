import { Button } from "@heroui/react";
import { MicIcon, PaperclipIcon, LoaderIcon, SendHorizontalIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { ReplyPreview } from "./ReplyPreview";
import { EditPreview } from "./EditPreview";
import { MediaSendPreviewModal } from "./MediaSendPreviewModal";

export function ChatComposer() {
  const composerText = useChatStore((state) => state.composerText);
  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);
  const sendVoiceMessage = useChatStore((state) => state.sendVoiceMessage);
  const isSendingMedia = useChatStore((state) => state.isSendingMedia);
  const sendTextMessage = useChatStore((state) => state.sendTextMessage);
  const setComposerText = useChatStore((state) => state.setComposerText);
  const { activeConversationId, activeConversation } = useSelectedConversation();
  const authUser = useAuthStore((state) => state.authUser);
  const editingMessage = useChatStore((state) => state.editingMessage);
  const clearEditingMessage = useChatStore((state) => state.clearEditingMessage);
  const mediaInputRef = useRef(null);
  const textAreaRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const [pendingMediaFile, setPendingMediaFile] = useState(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const sendTypingStatus = useChatStore((state) => state.sendTypingStatus);
  const typingTimeoutRef = useRef(null);
  const { replyingTo, clearReplyingTo } = useChatStore();
  const selectedGroup = useChatStore((state) => state.conversations.find((item) => String(item._id) === String(activeConversationId)));
  const groupSendRestricted = activeConversation?.isGroup && selectedGroup?.permissions?.sendMessages === "admins" && !selectedGroup.admins?.some((admin) => String(admin._id || admin) === String(authUser?._id));

  const resizeComposer = () => {
    const textArea = textAreaRef.current;
    if (!textArea) return;

    textArea.style.height = "0px";
    textArea.style.height = `${Math.min(textArea.scrollHeight, 144)}px`;
    textArea.style.overflowY = textArea.scrollHeight > 144 ? "auto" : "hidden";
  };

  useEffect(() => {
    resizeComposer();
  }, [composerText, replyingTo]);

  useEffect(() => {
    const focusComposer = () => textAreaRef.current?.focus();
    window.addEventListener("lark:focus-composer", focusComposer);
    return () => window.removeEventListener("lark:focus-composer", focusComposer);
  }, []);

  const handleSend = async () => {
    sendTypingStatus(activeConversationId, false);
    await sendTextMessage(activeConversationId);
  };

  const handleComposerTextChange = (event) => {
    setComposerText(event.target.value);
    sendTypingStatus(activeConversationId, true);

    clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(activeConversationId, false);
    }, 1200);
  };

  const handleMediaPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPendingMediaFile(file);
  };

  const handleSendPendingMedia = async (caption) => {
    if (!pendingMediaFile) return;

    await sendMediaMessage({
      conversationId: activeConversationId,
      file: pendingMediaFile,
      caption,
    });
    setPendingMediaFile(null);
  };

  const handleVoiceRecord = async () => {
    if (isRecordingVoice) {
      recorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    voiceChunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) voiceChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setIsRecordingVoice(false);
      const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
      await sendVoiceMessage({ conversationId: activeConversationId, file });
    };

    setIsRecordingVoice(true);
    recorder.start();
  };

  return (
    <footer className="shrink-0 border-t border-border px-1.5 pb-2 pt-2 sm:px-2">
      {groupSendRestricted ? <p className="mx-auto mb-2 max-w-full rounded-xl bg-surface px-3 py-2 text-center text-sm text-muted">Only group admins can send messages.</p> : null}
      <EditPreview message={editingMessage} onClose={clearEditingMessage} />
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
          disabled={isSendingMedia || groupSendRestricted}
          tabIndex={-1}
          aria-hidden
          onChange={handleMediaPick}
        />
        <Button
          variant="ghost"
          isIconOnly
          isDisabled={isSendingMedia || groupSendRestricted}
          className="mb-1 size-9 shrink-0 touch-manipulation self-end text-accent"
          onPress={() => mediaInputRef.current?.click()}
        >
          <PaperclipIcon className="size-5 sm:size-6" strokeWidth={2} />
        </Button>
        <div className="flex min-h-11 flex-1 items-center rounded-3xl border border-border bg-surface px-3 py-2 shadow-sm focus-within:border-accent/60">
          <textarea
          ref={textAreaRef}
          aria-label="Message"
          placeholder="Message"
          rows={1}
          value={composerText}
          disabled={groupSendRestricted}
          onChange={handleComposerTextChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="max-h-36 min-h-6 w-full resize-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-muted"
        />
        </div>

        {composerText.trim() || editingMessage ? (
          <Button
            variant="primary"
            isIconOnly
            isDisabled={!composerText.trim() || groupSendRestricted}
            className="mb-1 size-10 shrink-0 self-end rounded-full"
            onPress={handleSend}
          >
            <SendHorizontalIcon className="size-5" />
          </Button>
        ) : (
          <Button
            variant={isRecordingVoice ? "primary" : "ghost"}
            isIconOnly
            isDisabled={isSendingMedia || groupSendRestricted}
            className="mb-1 size-10 shrink-0 self-end rounded-full"
            onPress={handleVoiceRecord}
          >
            {isRecordingVoice ? <SquareIcon className="size-4 fill-current" /> : <MicIcon className="size-5" />}
          </Button>
        )}
      </div>

      <MediaSendPreviewModal
        file={pendingMediaFile}
        isSending={isSendingMedia}
        onClose={() => setPendingMediaFile(null)}
        onSend={handleSendPendingMedia}
      />
    </footer>
  );
}
