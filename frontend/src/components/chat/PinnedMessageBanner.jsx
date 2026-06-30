import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PinIcon,
  XIcon,
} from "lucide-react";

import { getMessagePreview } from "./messagePreview";

export function PinnedMessageBanner({
  message,
  currentIndex,
  total,
  onPrevious,
  onNext,
  onOpenAll,
  onHide,
  onJump,
}) {
  if (!message || total === 0) return null;

  const hasMany = total > 1;

  return (
    <div className="sticky top-0 z-10 mb-2 flex items-center gap-1 rounded-xl border border-border bg-background/95 px-2 py-2 text-sm shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={onJump}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-surface"
      >
        <PinIcon className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-accent">
            Pinned message {currentIndex + 1}/{total}
          </span>
          <span className="block truncate text-xs text-muted">
            {getMessagePreview(message)}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onPrevious}
        disabled={!hasMany}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground disabled:opacity-35"
        aria-label="Previous pinned message"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasMany}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground disabled:opacity-35"
        aria-label="Next pinned message"
      >
        <ChevronRightIcon className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onOpenAll}
        className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft"
      >
        View All
      </button>

      <button
        type="button"
        onClick={onHide}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"
        aria-label="Hide pinned message banner"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
