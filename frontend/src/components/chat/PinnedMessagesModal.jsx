import { PinIcon, XIcon } from "lucide-react";

import { getMessagePreview } from "./messagePreview";

export function PinnedMessagesModal({ isOpen, messages, onClose, onSelectMessage }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <PinIcon className="size-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">Pinned messages</h2>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
              {messages.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close pinned messages"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-2">
          {messages.map((message, index) => (
            <button
              key={message.id}
              type="button"
              onClick={() => onSelectMessage(message.id)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface"
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {message.senderName || "Message"}
                </span>
                <span className="block truncate text-xs text-muted">
                  {getMessagePreview(message)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
