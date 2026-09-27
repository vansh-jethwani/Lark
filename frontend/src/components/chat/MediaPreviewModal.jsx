import { useEffect, useState } from "react";
import { DownloadIcon, ForwardIcon, RotateCwIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { withTransform } from "../../lib/imagekit";
import { refreshMessageMedia } from "../../lib/media";
import { useDecryptedMediaUrl } from "../../hooks/useDecryptedMedia";

const FULL_IMAGE_TRANSFORM = "q-auto,w-1920,f-auto";
const FULL_VIDEO_TRANSFORM = "q-90,w-1280";

export function MediaPreviewModal({ media, onClose, onForward }) {
  const isOpen = Boolean(media?.src);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [source, setSource] = useState(media?.src || "");

  useEffect(() => setSource(media?.src || ""), [media?.src]);

  // Group E2EE: decrypt ciphertext attachments into a blob URL before display.
  const decrypted = useDecryptedMediaUrl({
    messageId: media?.messageId,
    signedUrl: media?.src,
    groupId: media?.groupId,
    keyVersion: media?.keyVersion,
    mediaIv: media?.mediaIv,
    fileType: media?.fileType,
    mediaType: media?.type === "video" ? "video" : "image",
  });

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
  // Encrypted group media: never display or link the raw ciphertext URL —
  // show a placeholder until the decrypted blob URL resolves.
  const encryptedPending = decrypted.encrypted && !decrypted.url;
  const resolvedSrc = decrypted.encrypted ? decrypted.url : source;
  // Never apply ImageKit transforms to a decrypted blob URL.
  const previewSrc = decrypted.encrypted
    ? resolvedSrc
    : isVideo
      ? withTransform(source, FULL_VIDEO_TRANSFORM)
      : withTransform(source, FULL_IMAGE_TRANSFORM);
  const fileName = media.fileName || (isVideo ? "video" : "image");
  const handleMediaError = async () => {
    if (decrypted.encrypted || !media.messageId) return;
    try {
      setSource((await refreshMessageMedia(media.messageId, isVideo ? "video" : "image")).url);
    } catch {
      // leave the broken source; the error state stands
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95 text-white">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {fileName}
        </p>

        {!isVideo ? <>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Zoom in"><ZoomInIcon className="size-5" /></button>
          <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Zoom out"><ZoomOutIcon className="size-5" /></button>
          <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Rotate image"><RotateCwIcon className="size-5" /></button>
        </> : null}
        {onForward ? <button type="button" onClick={onForward} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Forward media"><ForwardIcon className="size-5" /></button> : null}
        {!encryptedPending && resolvedSrc ? <a href={resolvedSrc} download target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Download original media"><DownloadIcon className="size-5" /></a> : null}

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
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6"
      >
        {encryptedPending ? (
          <p className="px-6 text-center text-sm text-white/70">
            {decrypted.failed ? "Couldn't decrypt this media" : "Decrypting…"}
          </p>
        ) : isVideo ? (
          <video
            src={previewSrc}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
            onError={handleMediaError}
          />
        ) : (
          <img
            src={previewSrc}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain transition-transform duration-150"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center" }}
            onClick={(event) => event.stopPropagation()}
            onError={handleMediaError}
          />
        )}
      </div>
    </div>
  );
}
