import { CheckIcon } from "lucide-react";

export function SelectionOverlay({ selected }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full border transition ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-transparent"
      }`}
      aria-hidden
    >
      <CheckIcon className="size-4" />
    </span>
  );
}
