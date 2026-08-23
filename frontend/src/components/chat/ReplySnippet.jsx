import { FileTextIcon, VideoIcon } from "lucide-react";

import { withTransform } from "../../lib/imagekit";

const THUMB_TRANSFORM = "q-auto,w-96,h-96,c-fill,f-auto";

function getReplyText(message) {
  if (message?.text) return message.text;
  if (message?.imageUrl || message?.image) return "Photo";
  if (message?.videoUrl || message?.video) return "Video";
  return message?.fileName || "Media message";
}

export function ReplySnippet({
  message,
  className = "",
  onClick,
  title = "Reply",
  titleClassName = "text-teal-700 dark:text-teal-300",
  compact = false,
}) {
  if (!message) return null;

  const imageUrl = message.imageUrl || message.image;
  const videoUrl = message.videoUrl || message.video;
  const fileUrl = message.fileUrl || message.file;
  const canClick = typeof onClick === "function";
  const Component = canClick ? "button" : "div";
  const titleText = message.senderName || title;

  return (
    <Component
      type={canClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border-l-[3px] border-accent bg-black/10 px-2 py-1.5 text-left transition ${
        canClick ? "cursor-pointer hover:bg-black/15" : ""
      } ${className}`}
    >
      {imageUrl ? (
        <img
          src={withTransform(imageUrl, THUMB_TRANSFORM)}
          alt=""
          className={`${compact ? "size-9" : "size-11"} shrink-0 rounded-md object-cover`}
        />
      ) : videoUrl ? (
        <span
          className={`${compact ? "size-9" : "size-11"} flex shrink-0 items-center justify-center rounded-md bg-background/35`}
        >
          <VideoIcon className="size-4" aria-hidden />
        </span>
      ) : fileUrl ? (
        <span
          className={`${compact ? "size-9" : "size-11"} flex shrink-0 items-center justify-center rounded-md bg-background/35`}
        >
          <FileTextIcon className="size-4" aria-hidden />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs font-semibold ${titleClassName}`}>
          {titleText}
        </span>
        <span className="block truncate text-xs opacity-75">
          {getReplyText(message)}
        </span>
      </span>
    </Component>
  );
}
