import { CheckCheckIcon, CheckIcon, FileTextIcon } from "lucide-react";
import { withTransform } from "../../lib/imagekit";
import { MessageVideo } from "./MessageVideo";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Compress + size images for the bubble (q-auto works for images; f-auto picks WebP/AVIF).
const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";

export function MessageBubble({ message }) {
  const isOwnMessage = message.role === "me";
  const hasImage = Boolean(message.imageUrl);
  const hasVideo = Boolean(message.videoUrl);
  const hasFile = Boolean(message.fileUrl);
  const statusLabel = message.readAt ? "Read" : message.deliveredAt ? "Delivered" : "Sent";
  const StatusIcon = message.deliveredAt || message.readAt ? CheckCheckIcon : CheckIcon;

  return (
    <div className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(90%,28rem)] rounded-2xl px-3 py-2 text-[15px] leading-snug sm:max-w-[min(75%,28rem)] sm:px-3.5 ${isOwnMessage
          ? "rounded-br-md bg-accent text-accent-foreground"
          : "rounded-bl-md bg-surface"
          }`}
      >
        {hasImage ? (
          <img
            src={withTransform(message.imageUrl, IMAGE_TRANSFORM)}
            alt=""
            className="mb-1.5 max-h-40 max-w-full rounded-lg object-cover sm:max-h-52 sm:rounded-xl"
          />
        ) : null}
        {hasVideo ? <MessageVideo src={message.videoUrl} /> : null}
        {hasFile ? (
          <a
            href={message.fileUrl}
            target="_blank"
            rel="noreferrer"
            className={`mb-1.5 flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${isOwnMessage
              ? "border-accent-foreground/20 bg-accent-foreground/10"
              : "border-border bg-background"
              }`}
          >
            <FileTextIcon className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{message.fileName || "Document"}</span>
          </a>
        ) : null}
        {message.text ? (
          !isOwnMessage ? (
            <div
              className="
    whitespace-normal
    break-words

    [&_h1]:text-2xl
    [&_h1]:font-bold

    [&_h2]:text-xl
    [&_h2]:font-semibold

    [&_h3]:text-lg
    [&_h3]:font-semibold

    [&_strong]:font-bold
    [&_em]:italic

    [&_ul]:list-disc
    [&_ul]:ml-6
    [&_ul]:my-2

    [&_ol]:list-decimal
    [&_ol]:ml-6
    [&_ol]:my-2

    [&_li]:my-1

    [&_blockquote]:border-l-4
    [&_blockquote]:pl-3
    [&_blockquote]:italic

    [&_pre]:overflow-x-auto
    [&_pre]:rounded-lg
    [&_pre]:p-3
    [&_pre]:bg-zinc-900

    [&_code]:rounded
    [&_code]:px-1
    [&_code]:py-0.5
  "
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {message.text}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )
        ) : null}
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${isOwnMessage ? "text-accent-foreground/75" : "text-muted"
            }`}
        >
          <span>{message.time}</span>
          {isOwnMessage ? (
            <StatusIcon
              className={`size-3.5 ${message.readAt ? "text-sky-300" : ""}`}
              aria-label={statusLabel}
            />
          ) : null}
        </p>
      </div>
    </div>
  );
}
