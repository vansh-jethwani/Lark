import { DownloadIcon, ImageIcon, VideoIcon } from "lucide-react";

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaDownloadCard({ type, fileName, fileSize, onDownload }) {
  const isVideo = type === "video";
  const Icon = isVideo ? VideoIcon : ImageIcon;

  return (
    <div className="mb-1.5 flex min-w-52 max-w-full items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-accent">
        <Icon className="size-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {fileName || (isVideo ? "Video" : "Photo")}
        </span>
        <span className="block text-xs text-muted">
          {formatFileSize(fileSize) || (isVideo ? "Video" : "Photo")}
        </span>
      </span>

      <button
        type="button"
        onClick={onDownload}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-sm hover:opacity-90"
        aria-label={`Download ${isVideo ? "video" : "photo"}`}
      >
        <DownloadIcon className="size-5" aria-hidden />
      </button>
    </div>
  );
}
