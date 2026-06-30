import { useState } from "react";
import { Avatar } from "@heroui/react";
import { CheckIcon, Forward, X } from "lucide-react";

import { AI_USER_ID } from "../../data/aiUser";
import { getInitials } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";

function uniqueRecipients(users, conversations, authUserId) {
  const recipients = new Map();

  [...users, ...conversations].forEach((user) => {
    if (!user?._id) return;
    if (String(user._id) === String(authUserId)) return;
    if (String(user._id) === String(AI_USER_ID) || user.isAI) return;

    recipients.set(user._id, user);
  });

  return [...recipients.values()].sort((a, b) =>
    String(a.fullName || "").localeCompare(String(b.fullName || "")),
  );
}

export function ForwardMessageModal({ isOpen, onClose, onForwardComplete, message, messages }) {
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const users = useChatStore((state) => state.users);
  const conversations = useChatStore((state) => state.conversations);
  const forwardMessage = useChatStore((state) => state.forwardMessage);
  const forwardMessages = useChatStore((state) => state.forwardMessages);
  const authUser = useAuthStore((state) => state.authUser);

  if (!isOpen) return null;

  const recipients = uniqueRecipients(users, conversations, authUser?._id);
  const messageIds = (Array.isArray(messages) && messages.length > 0 ? messages : [message])
    .filter(Boolean)
    .map((item) => item._id || item.id);

  const toggleRecipient = (receiverId) => {
    setSelectedRecipientIds((current) =>
      current.includes(receiverId)
        ? current.filter((id) => id !== receiverId)
        : [...current, receiverId],
    );
  };

  const handleClose = () => {
    setSelectedRecipientIds([]);
    onClose();
  };

  const handleForward = async () => {
    const didForward =
      messageIds.length === 1
        ? await forwardMessage({
            messageId: messageIds[0],
            receiverIds: selectedRecipientIds,
          })
        : await forwardMessages({
            messageIds,
            receiverIds: selectedRecipientIds,
          });

    if (didForward) {
      handleClose();
      onForwardComplete?.();
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[80dvh] w-full max-w-sm flex-col rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Forward className="size-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">
              Forward {messageIds.length > 1 ? `${messageIds.length} messages` : "message"}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close forward dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-2">
          {recipients.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No people available to forward to.
            </p>
          ) : (
            recipients.map((recipient) => (
              <button
                key={recipient._id}
                type="button"
                onClick={() => toggleRecipient(recipient._id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface"
              >
                <Avatar className="size-10 shrink-0">
                  <Avatar.Image alt={recipient.fullName} src={recipient.profilePic} />
                  <Avatar.Fallback className="text-sm font-medium">
                    {getInitials(recipient.fullName)}
                  </Avatar.Fallback>
                </Avatar>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {recipient.fullName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {recipient.email}
                  </span>
                </span>

                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                    selectedRecipientIds.includes(recipient._id)
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-transparent"
                  }`}
                >
                  <CheckIcon className="size-4" aria-hidden />
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-xs text-muted">
            {selectedRecipientIds.length} selected
          </span>

          <button
            type="button"
            onClick={handleForward}
            disabled={selectedRecipientIds.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Forward className="size-4" aria-hidden />
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
