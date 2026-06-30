import { PencilIcon, XIcon } from "lucide-react";

export function EditPreview({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm sm:mx-3">
      <PencilIcon className="size-4 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-accent">Editing message</p>
        <p className="truncate text-sm text-muted">{message.text}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-1.5 text-muted hover:bg-background hover:text-foreground"
        aria-label="Cancel edit"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}
