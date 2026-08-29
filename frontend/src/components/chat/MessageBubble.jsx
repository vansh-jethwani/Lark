import { memo, useState } from "react";
import {
  CheckCheckIcon,
  CheckIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  PresentationIcon,
  ArchiveIcon,
  FileIcon,
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
import { MediaPreviewModal } from "./MediaPreviewModal";
import { ReplySnippet } from "./ReplySnippet";
import { refreshMessageMedia } from "../../lib/media";
import { ReactionSummary } from "./ReactionBar";
import { SelectionOverlay } from "./SelectionOverlay";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";

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
    if (matchIndex > cursor) {
      parts.push(value.slice(cursor, matchIndex));
    }

    parts.push(
      <mark
        key={`${matchIndex}-${lowerQuery}`}
        className="rounded bg-yellow-300 px-0.5 text-black"
      >
        {value.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );

    cursor = matchIndex + normalizedQuery.length;
    matchIndex = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts;
}

function getFileDisplayInfo(fileType = "", fileName = "") {
  const type = String(fileType).toLowerCase();
  const name = String(fileName).toLowerCase();

  // PDF
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return {
      label: "PDF",
      Icon: FileTextIcon,
    };
  }

  // Word
  if (
    type.includes("word") ||
    type.includes("wordprocessingml") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return {
      label: "WORD",
      Icon: FileTextIcon,
    };
  }

  // Excel / CSV
  if (
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv")
  ) {
    return {
      label: "EXCEL",
      Icon: FileSpreadsheetIcon,
    };
  }

  // PowerPoint
  if (
    type.includes("powerpoint") ||
    type.includes("presentation") ||
    name.endsWith(".ppt") ||
    name.endsWith(".pptx")
  ) {
    return {
      label: "PPT",
      Icon: PresentationIcon,
    };
  }

  // Archives
  if (
    type.includes("zip") ||
    type.includes("rar") ||
    type.includes("7z") ||
    name.endsWith(".zip") ||
    name.endsWith(".rar") ||
    name.endsWith(".7z")
  ) {
    return {
      label: "ARCHIVE",
      Icon: ArchiveIcon,
    };
  }

  return {
    label: "FILE",
    Icon: FileIcon,
  };
}

export const MessageBubble = memo(function MessageBubble({
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
  

  /*
   * Normalize the message ID.
   * Some parts of the application use _id while others use id.
   */
  const messageId = message._id || message.id;

  const hasImage = Boolean(message.imageUrl);
  const hasVideo = Boolean(message.videoUrl);
  const hasAudio = Boolean(message.audioUrl);
  const hasFile = Boolean(message.fileUrl);

  /*
   * Backend sends:
   * fileThumbnail
   *
   * Do NOT use fileThumbnailUrl here.
   */
  const hasFileThumbnail = Boolean(message.fileThumbnail);

  /*
   * A file with a thumbnail is also visual media.
   */
  const hasVisualMedia = hasImage || hasVideo || hasFileThumbnail;

  const fileDisplay = getFileDisplayInfo(message.fileType, message.fileName);

  const FileTypeIcon = fileDisplay.Icon;

  const statusLabel = message.readAt
    ? "Read"
    : message.deliveredAt
      ? "Delivered"
      : "Sent";

  const StatusIcon =
    message.deliveredAt || message.readAt ? CheckCheckIcon : CheckIcon;

  const statusIconClassName = message.readAt
    ? "message-receipt--read"
    : "message-receipt--sent";

  const {
    deleteMessage,
    togglePinMessage,
    setEditingMessage,
    toggleReaction,
    setReplyingTo,
  } = useChatStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    x: 0,
    y: 0,
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);

  const [imageUnavailable, setImageUnavailable] = useState(false);

  const [fileThumbnailUnavailable, setFileThumbnailUnavailable] =
    useState(false);

  /*
   * Initial image URLs.
   *
   * These are only changed when an expired ImageKit URL
   * needs to be refreshed.
   */
  const [imageSrc, setImageSrc] = useState(message.imageUrl || "");

  const [imageThumbnailSrc, setImageThumbnailSrc] = useState(
    message.imageThumbnailUrl || "",
  );

  const refreshMedia = async (type) => {
    if (!messageId) {
      throw new Error("Message ID is missing.");
    }

    const result = await refreshMessageMedia(messageId, type);

    if (!result?.url) {
      throw new Error("Media refresh did not return a URL.");
    }

    return result;
  };

  const handleOpenDeletePopup = () => {
    setMenuOpen(false);
    setDeleteModalOpen(true);
  };

  const handleDeleteForMe = async () => {
    if (!messageId) {
      console.log("Message ID missing:", message);
      return;
    }

    await deleteMessage(messageId, "me");
    setDeleteModalOpen(false);
  };

  const handleDeleteForEveryone = async () => {
    if (!messageId) {
      console.log("Message ID missing:", message);
      return;
    }

    await deleteMessage(messageId, "everyone");

    setDeleteModalOpen(false);
  };

  const handleRightClick = (event) => {
    if (isSelectionMode) return;

    event.preventDefault();

    const menuWidth = 220;
    const menuHeight = 360;
    const padding = 12;

    let x = event.clientX;
    let y = event.clientY;

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

    onToggleSelected?.(messageId);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.text || "");

    setMenuOpen(false);
  };

  const handlePin = async () => {
    setMenuOpen(false);

    if (!messageId) return;

    await togglePinMessage(messageId);
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

    if (!messageId) return;

    await toggleReaction(messageId, emoji);
  };

  const openMediaPreview = (media) => {
    if (isSelectionMode) return;

    setPreviewMedia(media);
  };

  const isMediaOnly =
    (hasImage || hasVideo || hasAudio || hasFile) &&
    !message.text &&
    !message.replyTo;

  return (
    <div
      id={`message-${messageId}`}
      data-message-id={messageId}
      onClickCapture={handleSelectionClickCapture}
      className={`flex w-full scroll-mt-24 items-center gap-2 transition-[background-color,filter] duration-500 ${
        isOwnMessage ? "justify-end" : "justify-start"
      } ${
        isSelectionMode
          ? "cursor-pointer rounded-2xl px-1 py-0.5 hover:bg-surface/70"
          : ""
      } ${isSelected ? "bg-accent/10" : ""} ${
        isHighlighted ? "rounded-2xl bg-accent/15" : ""
      }`}
    >
      {isSelectionMode && !isOwnMessage ? (
        <SelectionOverlay selected={isSelected} />
      ) : null}

      <div className="group relative max-w-[min(90%,28rem)] sm:max-w-[min(75%,28rem)]">
        <div
          onContextMenu={handleRightClick}
          className={`rounded-2xl ${
            isMediaOnly
              ? "p-1 shadow-none"
              : hasVisualMedia
                ? "p-1"
                : "px-3 py-2 sm:px-3.5"
          } text-[15px] leading-snug shadow-sm transition-shadow ${
            isHighlighted ? "ring-2 ring-accent/70" : ""
          } ${
            isOwnMessage
              ? "rounded-br-md bg-accent text-accent-foreground"
              : "rounded-bl-md bg-surface"
          }`}
        >
          {message.isGroup && !isOwnMessage ? (
            <p className="mb-1 text-xs font-semibold text-accent">
              {message.senderName}
            </p>
          ) : null}

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

          {/* IMAGE */}

          {hasImage && !imageUnavailable ? (
            <button
              type="button"
              onClick={() =>
                openMediaPreview({
                  type: "image",
                  src: message.imageOriginalUrl || imageSrc,
                  messageId,
                  fileName: message.fileName || "Photo",
                })
              }
              className="mb-px block max-w-full cursor-zoom-in overflow-hidden rounded-md"
              aria-label="Open image preview"
            >
              <img
                src={
                  imageThumbnailSrc || withTransform(imageSrc, IMAGE_TRANSFORM)
                }
                alt=""
                className="h-[clamp(12rem,32vw,16rem)] w-[clamp(14rem,42vw,22rem)] max-w-[72vw] object-cover"
                loading="lazy"
                decoding="async"
                onError={async () => {
                  try {
                    const fresh = await refreshMedia("image");

                    setImageSrc(fresh.url || "");

                    setImageThumbnailSrc(fresh.thumbnailUrl || "");
                  } catch {
                    setImageUnavailable(true);
                  }
                }}
              />
            </button>
          ) : null}

          {hasImage && imageUnavailable ? (
            <a
              href={message.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-px block rounded-md bg-background/60 px-1.5 py-1 text-xs text-accent"
            >
              Open photo
            </a>
          ) : null}

          {/* VIDEO */}

          {hasVideo ? (
            <MessageVideo
              src={message.videoUrl}
              thumbnailSrc={message.videoThumbnailUrl}
              onOpen={() =>
                openMediaPreview({
                  type: "video",
                  src: message.videoUrl,
                  messageId,
                  fileName: message.fileName || "Video",
                })
              }
            />
          ) : null}

          {/* AUDIO */}

          {hasAudio ? (
            <MessageAudio src={message.audioUrl} messageId={messageId} />
          ) : null}

          {/* FILE / PDF / WORD / EXCEL / PPT */}

          {hasFile && (
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noreferrer"
              onClick={async (event) => {
                if (!message.fileUrl?.includes("ik-t=")) {
                  return;
                }

                event.preventDefault();

                try {
                  const fresh = await refreshMedia("file");

                  if (fresh?.url) {
                    window.open(fresh.url, "_blank", "noopener,noreferrer");
                  }
                } catch {
                  window.open(message.fileUrl, "_blank", "noopener,noreferrer");
                }
              }}
              className={`mb-1 block h-[190px] w-[280px] max-w-full overflow-hidden rounded-xl border ${
                isOwnMessage
                  ? "border-accent-foreground/20 bg-accent-foreground/10"
                  : "border-border bg-background"
              }`}
            >
              {message.fileThumbnail ? (
                <div className="h-[140px] w-full overflow-hidden bg-black/5">
                  <img
                    src={message.fileThumbnail}
                    alt={message.fileName || "File preview"}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-[140px] items-center justify-center bg-black/5">
                  <div className="flex flex-col items-center gap-2">
                    <div className="grid size-14 place-items-center rounded-xl bg-background shadow-sm">
                      <FileTypeIcon className="size-7 text-accent" />
                    </div>

                    <span className="text-xs font-semibold uppercase text-muted">
                      {fileDisplay.label}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex h-[50px] min-w-0 items-center gap-2 px-3">
                <FileTypeIcon className="size-5 shrink-0 text-accent" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {message.fileName || "Document"}
                  </p>

                  {message.fileSize ? (
                    <p className="text-xs text-muted">
                      {(message.fileSize / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  ) : null}
                </div>
              </div>
            </a>
          )}

          {/* REPLY */}

          {message.replyTo ? (
            <ReplySnippet
              message={message.replyTo}
              compact
              className={`mb-1.5 ${
                isOwnMessage ? "bg-accent-foreground/15" : "bg-background/70"
              }`}
              titleClassName={isOwnMessage ? "text-teal-950" : "text-teal-300"}
              onClick={() =>
                onJumpToMessage?.(message.replyTo.id || message.replyTo._id)
              }
            />
          ) : null}

          {/* TEXT */}

          {message.text ? (
            searchQuery.trim() ? (
              <p
                className={`whitespace-pre-wrap break-words ${
                  hasVisualMedia ? "px-2.5 pt-1" : ""
                }`}
              >
                <HighlightedMessageText
                  text={message.text}
                  query={searchQuery}
                />

                {message.isEdited ? (
                  <span className="ml-2 text-xs italic opacity-70">edited</span>
                ) : null}
              </p>
            ) : !isOwnMessage ? (
              <div
                className={`whitespace-normal break-words [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_strong]:font-bold [&_em]:italic [&_ul]:ml-6 [&_ul]:my-2 [&_ul]:list-disc [&_ol]:ml-6 [&_ol]:my-2 [&_ol]:list-decimal [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 ${
                  hasVisualMedia ? "px-2.5 pt-1" : ""
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {String(message.text || "")}
                </ReactMarkdown>

                {message.isEdited ? (
                  <span className="ml-2 text-xs italic opacity-70">edited</span>
                ) : null}
              </div>
            ) : (
              <p
                className={`whitespace-pre-wrap break-words ${
                  hasVisualMedia ? "px-2.5 pt-1" : ""
                }`}
              >
                {message.text}

                {message.isEdited ? (
                  <span className="ml-2 text-xs italic opacity-70">edited</span>
                ) : null}
              </p>
            )
          ) : null}

          {/* TIME + STATUS */}

          <p
            className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${
              hasVisualMedia && !isMediaOnly ? "px-2.5 pb-1" : ""
            } ${isOwnMessage ? "text-accent-foreground/75" : "text-muted"}`}
          >
            <span>{message.time}</span>

            {isOwnMessage ? (
              <StatusIcon
                className={`size-3.5 shrink-0 stroke-[2.5] ${statusIconClassName}`}
                aria-label={statusLabel}
              />
            ) : null}
          </p>
        </div>

        {/* CONTEXT MENU */}

        {menuOpen ? (
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
              onStartSelection?.(messageId);
            }}
            onReact={handleReact}
          />
        ) : null}

        <ReactionSummary reactions={message.reactions} />

        {/* DELETE MODAL */}

        <DeleteMessageModal
          isOpen={deleteModalOpen}
          isOwnMessage={isOwnMessage}
          onClose={() => setDeleteModalOpen(false)}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
        />

        {/* FORWARD MODAL */}

        <ForwardMessageModal
          isOpen={forwardModalOpen}
          message={message}
          onClose={() => setForwardModalOpen(false)}
        />

        {/* MEDIA PREVIEW */}

        <MediaPreviewModal
          key={previewMedia?.src || "closed"}
          media={previewMedia}
          onClose={() => setPreviewMedia(null)}
          onForward={() => {
            setPreviewMedia(null);
            setForwardModalOpen(true);
          }}
        />
      </div>

      {isSelectionMode && isOwnMessage ? (
        <SelectionOverlay selected={isSelected} />
      ) : null}
    </div>
  );
});
