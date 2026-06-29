export function TypingIndicator({ label = "Typing" }) {
  return (
    <div className="flex w-full justify-start">
      <div className="rounded-2xl rounded-bl-md bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{label}</span>
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
          </span>
        </div>
      </div>
    </div>
  );
}