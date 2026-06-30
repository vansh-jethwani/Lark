import { useState } from "react";
import {
  CheckCheckIcon,
  CheckIcon,
  FileTextIcon,
  ForwardIcon,
  PinIcon,
} from "lucide-react";

import { withTransform } from "../../lib/imagekit";
import { MessageVideo } from "./MessageVideo";
import { MessageAudio } from "./MessageAudio";
import { useChatStore } from "../../store/useChatStore";
import { MessageContextMenu } from "./MessageContextMenu";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { MediaDownloadCard } from "./MediaDownloadCard";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { ReplySnippet } from "./ReplySnippet";
import { ReactionSummary } from "./ReactionBar";
import { SelectionOverlay } from "./SelectionOverlay";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";
const DOWNLOADED_MEDIA_STORAGE_KEY = "lark-downloaded-chat-media";

function readDownloadedMediaIds() {
  try {
    return JSON.parse(sessionStorage.getItem(DOWNLOADED_MEDIA_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeDownloadedMediaIds(ids) {
  sessionStorage.setItem(DOWNLOADED_MEDIA_STORAGE_KEY, JSON.stringify(ids));
}

function HighlightedMessageText({ text, query }) {
  const value = String(text || "");
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;

  const lowerValue = value.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const parts = [];
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerQuery);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(value.slice(cursor, matchIndex));
    parts.push(
      <mark key={`${matchIndex}-${lowerQuery}`} className="rounded bg-yellow-300 px-0.5 text-black">
        {value.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );
    cursor = matchIndex + normalizedQuery.length;
    matchIndex = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

export function MessageBubble({
  message,
  isHighlighted = false,
  isSelectionMode = false,
  isSelected = false,
  onJumpToMessage,
  onToggleSelected,
  onStartSelection,
  searchQuery = "",
}) {
  const isOwnMessage = message.role === "me";

  const hasImage = Boolean(message.imageUrl);
  const hasVideo = Boolean(message.videoUrl);
  const hasAudio = Boolean(message.audioUrl);
  const hasFile = Boolean(message.fileUrl);
  const imageMediaId = `${message.id}:image`;
  const videoMediaId = `${message.id}:video`;

  const statusLabel = message.readAt ? "Read" : message.deliveredAt ? "Delivered" : "Sent";
  const StatusIcon = message.deliveredAt || message.readAt ? CheckCheckIcon : CheckIcon;
  const statusIconClassName = message.readAt
    ? "text-blue-700"
    : message.deliveredAt
      ? "text-slate-700"
      : "text-slate-600";

  const { deleteMessage, togglePinMessage, setEditingMessage, toggleReaction } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [downloadedMediaIds, setDownloadedMediaIds] = useState(readDownloadedMediaIds);
  const { setReplyingTo } = useChatStore();
  const isImageDownloaded = isOwnMessage || downloadedMediaIds.includes(imageMediaId);
  const isVideoDownloaded = isOwnMessage || downloadedMediaIds.includes(videoMediaId);

  const handleOpenDeletePopup = () => {
    setMenuOpen(false);
    setDeleteModalOpen(true);
  };

  const handleDeleteForMe = async () => {
    const messageId = message._id || message.id;

    if (!messageId) {
      console.log("Message ID missing:", message);
      return;
    }

    await deleteMessage(messageId, "me");
    setDeleteModalOpen(false);
  };

  const handleDeleteForEveryone = async () => {
    const messageId = message._id || message.id;

    if (!messageId) {
      console.log("Message ID missing:", message);
      return;
    }

    await deleteMessage(messageId, "everyone");
    setDeleteModalOpen(false);
  };

  const handleRightClick = (e) => {
    if (isSelectionMode) return;
    e.preventDefault();

    const menuWidth = 220;
    const menuHeight = 360;
    const padding = 12;

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    setMenuPosition({ x, y });
    setMenuOpen(true);
  };

  const handleSelectionClickCapture = (event) => {
    if (!isSelectionMode) return;

    event.preventDefault();
    event.stopPropagation();
    onToggleSelected?.(message.id);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.text || "");
    setMenuOpen(false);
  };

  const handlePin = async () => {
    setMenuOpen(false);
    await togglePinMessage(message.id);
  };

  const handleForward = () => {
    setMenuOpen(false);
    setForwardModalOpen(true);
  };

  const handleEdit = () => {
    setMenuOpen(false);
    setEditingMessage(message);
  };

  const handleReact = async (emoji) => {
    setMenuOpen(false);
    await toggleReaction(message.id, emoji);
  };

  const openMediaPreview = (media) => {
    if (isSelectionMode) return;
    setPreviewMedia(media);
  };

  const markMediaDownloaded = (mediaId) => {
    setDownloadedMediaIds((current) => {
      if (current.includes(mediaId)) return current;
      const next = [...current, mediaId];
      writeDownloadedMediaIds(next);
      return next;
    });
  };

  return (
    <div
      id={`message-${message.id}`}
      data-message-id={message.id}
      onClickCapture={handleSelectionClickCapture}
      className={`flex w-full scroll-mt-24 items-center gap-2 transition-[background-color,filter] duration-500 ${
        isOwnMessage ? "justify-end" : "justify-start"
      } ${isSelectionMode ? "cursor-pointer rounded-2xl px-1 py-0.5 hover:bg-surface/70" : ""} ${
        isSelected ? "bg-accent/10" : ""
      } ${isHighlighted ? "rounded-2xl bg-accent/15" : ""}`}
    >
      {isSelectionMode && !isOwnMessage ? <SelectionOverlay selected={isSelected} /> : null}

      <div className="group relative max-w-[min(90%,28rem)] sm:max-w-[min(75%,28rem)]">
        <div
          onContextMenu={handleRightClick}
          className={`rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm transition-shadow sm:px-3.5 ${
            isHighlighted ? "ring-2 ring-accent/70" : ""
          } ${isOwnMessage
            ? "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md bg-surface"
            }`}
        >
          {(message.isPinned || message.isForwarded) && (
            <div
              className={`mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium ${
                isOwnMessage ? "text-accent-foreground/80" : "text-muted"
              }`}
            >
              {message.isPinned ? (
                <span className="inline-flex items-center gap-1">
                  <PinIcon className="size-3" aria-hidden />
                  Pinned
                </span>
              ) : null}
              {message.isForwarded ? (
                <span className="inline-flex items-center gap-1">
                  <ForwardIcon className="size-3" aria-hidden />
                  Forwarded
                </span>
              ) : null}
            </div>
          )}

          {hasImage && !isImageDownloaded ? (
            <MediaDownloadCard
              type="image"
              fileName={message.fileName || "Photo"}
              fileSize={message.fileSize}
              onDownload={() => markMediaDownloaded(imageMediaId)}
            />
          ) : null}

          {hasImage && isImageDownloaded && (
            <button
              type="button"
              onClick={() =>
                openMediaPreview({
                  type: "image",
                  src: message.imageUrl,
                  fileName: message.fileName || "Photo",
                })
              }
              className="mb-1.5 block max-w-full cursor-zoom-in overflow-hidden rounded-lg sm:rounded-xl"
              aria-label="Open image preview"
            >
              <img
                src={withTransform(message.imageUrl, IMAGE_TRANSFORM)}
                alt=""
                className="max-h-40 max-w-full object-cover sm:max-h-52"
              />
            </button>
          )}

          {hasVideo && !isVideoDownloaded ? (
            <MediaDownloadCard
              type="video"
              fileName={message.fileName || "Video"}
              fileSize={message.fileSize}
              onDownload={() => markMediaDownloaded(videoMediaId)}
            />
          ) : null}

          {hasVideo && isVideoDownloaded && (
            <MessageVideo
              src={message.videoUrl}
              onOpen={() =>
                openMediaPreview({
                  type: "video",
                  src: message.videoUrl,
                  fileName: message.fileName || "Video",
                })
              }
            />
          )}

          {hasAudio && <MessageAudio src={message.audioUrl} />}

          {hasFile && (
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
              <span className="min-w-0 flex-1 truncate">
                {message.fileName || "Document"}
              </span>
            </a>
          )}

          {message.replyTo && (
            <ReplySnippet
              message={message.replyTo}
              compact
              className={`mb-1.5 ${
                isOwnMessage ? "bg-accent-foreground/15" : "bg-background/70"
              }`}
              titleClassName={isOwnMessage ? "text-teal-950" : "text-teal-300"}
              onClick={() => onJumpToMessage?.(message.replyTo.id)}
            />
          )}

          {message.text ? (
            searchQuery.trim() ? (
              <p className="whitespace-pre-wrap break-words">
                <HighlightedMessageText text={message.text} query={searchQuery} />
                {message.isEdited && (
                  <span className="ml-2 text-xs italic opacity-70">
                    edited
                  </span>
                )}
              </p>
            ) : !isOwnMessage ? (
              <div className="whitespace-normal break-words [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_strong]:font-bold [&_em]:italic [&_ul]:ml-6 [&_ul]:my-2 [&_ul]:list-disc [&_ol]:ml-6 [&_ol]:my-2 [&_ol]:list-decimal [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {String(message.text || "")}
                </ReactMarkdown>

                {message.isEdited && (
                  <span className="ml-2 text-xs italic opacity-70">
                    edited
                  </span>
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">
                {message.text}

                {message.isEdited && (
                  <span className="ml-2 text-xs italic opacity-70">
                    edited
                  </span>
                )}
              </p>
            )
          ) : null}

          <p
            className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${isOwnMessage ? "text-accent-foreground/75" : "text-muted"
              }`}
          >
            <span>{message.time}</span>

            {isOwnMessage && (
              <StatusIcon
                className={`size-3.5 ${statusIconClassName}`}
                aria-label={statusLabel}
              />
            )}
          </p>
        </div>


        {menuOpen && (
          <MessageContextMenu
            position={menuPosition}
            isOwnMessage={isOwnMessage}
            message={message}
            onClose={() => setMenuOpen(false)}
            onReply={() => {
              setReplyingTo(message);
              setMenuOpen(false);
            }}
            onEdit={handleEdit}
            onPin={handlePin}
            onCopy={handleCopy}
            onForward={handleForward}
            onDelete={handleOpenDeletePopup}
            onSelect={() => {
              setMenuOpen(false);
              onStartSelection?.(message.id);
            }}
            onReact={handleReact}

          />
        )}

        <ReactionSummary reactions={message.reactions} />




        <DeleteMessageModal
          isOpen={deleteModalOpen}
          isOwnMessage={isOwnMessage}
          onClose={() => setDeleteModalOpen(false)}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
        />

        <ForwardMessageModal
          isOpen={forwardModalOpen}
          message={message}
          onClose={() => setForwardModalOpen(false)}
        />

        <MediaPreviewModal
          media={previewMedia}
          onClose={() => setPreviewMedia(null)}
        />
      </div>

      {isSelectionMode && isOwnMessage ? <SelectionOverlay selected={isSelected} /> : null}
    </div>
  )
}
