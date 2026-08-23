import { XIcon } from "lucide-react";
import { useState } from "react";

export function DeleteAccountModal({ isOpen, isDeleting, onClose, onConfirm }) {
  const [password, setPassword] = useState("");

  const handleClose = () => {
    setPassword("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-red-500">Delete account</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close delete account dialog"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted">
          This permanently deletes your Lark account data and messages from this app.
          Enter your account password to continue.
        </p>

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-red-500"
          placeholder="Account password"
          autoComplete="current-password"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!password || isDeleting}
            onClick={() => onConfirm(password)}
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}
