import { X } from "lucide-react";
import { ReplySnippet } from "./ReplySnippet";

export function ReplyPreview({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2 shadow-sm sm:mx-3">
      <ReplySnippet
        message={message}
        title={message.senderName ? `Replying to ${message.senderName}` : "Replying"}
        titleClassName="text-teal-700 dark:text-teal-300"
        compact
        className="flex-1 bg-background/70"
      />

      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-1.5 text-muted hover:bg-background hover:text-foreground"
        aria-label="Cancel reply"
      >
          <X size={16} />
      </button>
    </div>
  );
}
