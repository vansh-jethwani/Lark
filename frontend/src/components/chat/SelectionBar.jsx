import { ForwardIcon, Trash2Icon, XIcon } from "lucide-react";

export function SelectionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDelete,
  onForward,
  onCancel,
}) {
  const allSelected = selectedCount > 0 && selectedCount === totalCount;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-3 py-2 shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"
          aria-label="Cancel selection"
        >
          <XIcon className="size-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {selectedCount} selected
          </p>
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs font-medium text-accent hover:underline"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        </div>

        <button
          type="button"
          onClick={onDelete}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2Icon className="size-4" aria-hidden />
          Delete
        </button>

        <button
          type="button"
          onClick={onForward}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ForwardIcon className="size-4" aria-hidden />
          Forward
        </button>
      </div>
    </div>
  );
}
