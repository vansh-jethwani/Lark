import { Trash2, X } from "lucide-react";

export function DeleteMessageModal({
  isOpen,
  isOwnMessage,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
      <div className="w-[90%] max-w-sm rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Delete message?</h2>

          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-surface"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted">
          Choose how you want to delete this message.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onDeleteForMe}
            className="flex items-center gap-3 rounded-xl px-4 py-2 text-left text-sm hover:bg-surface"
          >
            <Trash2 size={17} />
            Delete for me
          </button>

          {isOwnMessage && (
            <button
              onClick={onDeleteForEveryone}
              className="flex items-center gap-3 rounded-xl px-4 py-2 text-left text-sm text-red-500 hover:bg-surface"
            >
              <Trash2 size={17} />
              Delete for everyone
            </button>
          )}

          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-left text-sm hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}