import { useEffect } from "react";
import { XIcon } from "lucide-react";

import { withTransform } from "../../lib/imagekit";

const FULL_IMAGE_TRANSFORM = "q-auto,w-1920,f-auto";
const FULL_VIDEO_TRANSFORM = "q-90,w-1280";

export function MediaPreviewModal({ media, onClose }) {
  const isOpen = Boolean(media?.src);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isVideo = media.type === "video";
  const previewSrc = isVideo
    ? withTransform(media.src, FULL_VIDEO_TRANSFORM)
    : withTransform(media.src, FULL_IMAGE_TRANSFORM);
  const fileName = media.fileName || (isVideo ? "video" : "image");

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95 text-white">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {fileName}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close media preview"
        >
          <XIcon className="size-6" aria-hidden />
        </button>
      </div>

      <div
        onClick={onClose}
        className="flex min-h-0 flex-1 cursor-zoom-out items-center justify-center p-3 sm:p-6"
      >
        {isVideo ? (
          <video
            src={previewSrc}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <img
            src={previewSrc}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}
