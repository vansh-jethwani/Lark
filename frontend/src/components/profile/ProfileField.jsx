export function ProfileField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent/70 ${
        props.className || ""
      }`}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent/70 ${
        props.className || ""
      }`}
    />
  );
}
