import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { refreshMessageMedia } from "../../lib/media";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? `${hours}:${String(mins).padStart(2, "0")}` : `${mins}`;
  return `${mm}:${String(secs).padStart(2, "0")}`;
}

// Some recorded files report garbage durations (e.g. hours for a voice note).
// Only trust finite, sane values; otherwise show 0:00 until real metadata arrives.
function saneDuration(value) {
  return Number.isFinite(value) && value > 0 && value < 3 * 3600 ? value : 0;
}

const SPEEDS = [1, 1.5, 2];

export function MessageAudio({ src, messageId, isOwnMessage }) {
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const [audioSrc, setAudioSrc] = useState(src);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  useEffect(() => setAudioSrc(src), [src]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex, audioSrc]);

  // Only one voice note plays at a time: when another player starts,
  // every other player pauses itself. Also stop audio on unmount so
  // scrolling away never leaves sound playing.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleOtherPlay = (event) => {
      if (event.detail !== audio) audio.pause();
    };
    window.addEventListener("lark:audio-play", handleOtherPlay);
    return () => {
      window.removeEventListener("lark:audio-play", handleOtherPlay);
      audio.pause();
    };
  }, []);

  const notifyPlay = () => {
    setPlaying(true);
    window.dispatchEvent(new CustomEvent("lark:audio-play", { detail: audioRef.current }));
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const seek = (clientX) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="mb-px flex w-[280px] max-w-full items-center gap-2.5 px-1 py-1.5">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        className="hidden"
        onPlay={notifyPlay}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(saneDuration(event.currentTarget.duration))}
        onDurationChange={(event) => setDuration(saneDuration(event.currentTarget.duration))}
        onError={async () => {
          if (!messageId) return;
          try {
            setAudioSrc((await refreshMessageMedia(messageId, "audio")).url);
          } catch {
            /* keep the player's error state */
          }
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`grid size-10 shrink-0 place-items-center rounded-full shadow-sm transition-transform hover:scale-105 active:scale-95 ${
          isOwnMessage ? "bg-accent-foreground text-accent" : "bg-accent text-accent-foreground"
        }`}
      >
        {playing ? (
          <PauseIcon className="size-5 fill-current" aria-hidden />
        ) : (
          <PlayIcon className="size-5 translate-x-[1px] fill-current" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek voice message"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          onClick={(event) => seek(event.clientX)}
          onKeyDown={(event) => {
            const audio = audioRef.current;
            if (!audio) return;
            if (event.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 5);
            if (event.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className={`group relative h-1.5 cursor-pointer rounded-full ${
            isOwnMessage ? "bg-accent-foreground/25" : "bg-black/15 dark:bg-white/20"
          }`}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isOwnMessage ? "bg-accent-foreground" : "bg-accent"}`}
            style={{ width: `${progress}%` }}
          />
          <div
            className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow transition-opacity group-hover:opacity-100 ${
              progress > 2 ? "opacity-100" : "opacity-0"
            } ${isOwnMessage ? "bg-accent-foreground" : "bg-accent"}`}
            style={{ left: `${progress}%` }}
          />
        </div>
        <div
          className={`mt-1 flex items-center justify-between text-[11px] tabular-nums ${
            isOwnMessage ? "text-accent-foreground/70" : "text-muted"
          }`}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
        aria-label={`Playback speed ${SPEEDS[speedIndex]}x`}
        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums transition-colors ${
          isOwnMessage
            ? "bg-accent-foreground/15 text-accent-foreground hover:bg-accent-foreground/25"
            : "bg-accent/15 text-accent hover:bg-accent/25"
        }`}
      >
        {SPEEDS[speedIndex]}x
      </button>
    </div>
  );
}
