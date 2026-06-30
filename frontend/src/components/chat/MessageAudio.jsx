import { MicIcon } from "lucide-react";

export function MessageAudio({ src }) {
  return (
    <div className="mb-1.5 flex min-w-56 max-w-full items-center gap-2 rounded-xl bg-background/55 px-3 py-2">
      <MicIcon className="size-5 shrink-0 text-accent" aria-hidden />
      <audio src={src} controls preload="metadata" className="h-9 min-w-0 flex-1" />
    </div>
  );
}
