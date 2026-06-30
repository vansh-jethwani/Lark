import { FileTextIcon, SendHorizontalIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function MediaSendPreviewModal({ file, isSending, onClose, onSend }) {
  const [caption, setCaption] = useState("");
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 px-4">
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Send media</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"
            aria-label="Cancel media send"
          >
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isImage ? (
            <img src={previewUrl} alt="" className="mx-auto max-h-[50dvh] rounded-xl object-contain" />
          ) : isVideo ? (
            <video src={previewUrl} controls className="mx-auto max-h-[50dvh] rounded-xl" />
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-surface p-4">
              <FileTextIcon className="size-8 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={2}
            placeholder="Add a caption..."
            className="mb-3 max-h-28 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => onSend(caption)}
            disabled={isSending}
            className="ml-auto flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <SendHorizontalIcon className="size-4" aria-hidden />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
