import { MicIcon } from "lucide-react";

export function MessageAudio({ src }) {
  return (
    <div className="mb-px flex min-w-44 max-w-full items-center gap-1 rounded-md p-0">
      <MicIcon className="size-4 shrink-0 text-accent" aria-hidden />
      <audio src={src} controls preload="metadata" className="h-8 min-w-0 flex-1" />
    </div>
  );
}
