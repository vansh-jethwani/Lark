const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function ReactionPicker({ onReact }) {
  return (
    <div className="mb-1 flex items-center gap-1 border-b border-border pb-2">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className="grid size-8 place-items-center rounded-full text-lg hover:bg-surface"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionSummary({ reactions = [] }) {
  if (!reactions.length) return null;

  const counts = reactions.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="absolute -bottom-3 right-2 flex rounded-full border border-border bg-background px-1.5 py-0.5 text-xs shadow-md">
      {Object.entries(counts).map(([emoji, count]) => (
        <span key={emoji} className="leading-none">
          {emoji}{count > 1 ? count : ""}
        </span>
      ))}
    </div>
  );
}
