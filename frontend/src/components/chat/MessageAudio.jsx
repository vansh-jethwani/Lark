import { useEffect, useState } from "react";
import { MicIcon } from "lucide-react";
import { refreshMessageMedia } from "../../lib/media";

export function MessageAudio({ src, messageId }) {
  const [audioSrc, setAudioSrc] = useState(src);
  useEffect(() => setAudioSrc(src), [src]);
  return (
    <div className="mb-px flex min-w-44 max-w-full items-center gap-1 rounded-md p-0">
      <MicIcon className="size-4 shrink-0 text-accent" aria-hidden />
      <audio src={audioSrc} controls preload="metadata" className="h-8 min-w-0 flex-1" onError={async () => {
        if (!messageId) return;
        try { setAudioSrc((await refreshMessageMedia(messageId, "audio")).url); } catch { /* browser control keeps its normal error state */ }
      }} />
    </div>
  );
}
