import {
  getSignedMediaUrl,
  getSignedPdfThumbnailUrl,
} from "./imagekit.js";

const IMAGE_DISPLAY = [{ width: 640, quality: "auto", format: "auto" }];
const IMAGE_THUMBNAIL = [{ width: 320, height: 320, cropMode: "maintain_ratio", quality: "auto", format: "auto" }];
const VIDEO_THUMBNAIL = [{ width: 640, quality: 80 }];

function isPrivatePath(value) {
  return typeof value === "string" && value.startsWith("/");
}

function signed(value, transformation) {
  return isPrivatePath(value) ? getSignedMediaUrl(value, transformation) : value || "";
}

// Database fields retain ImageKit file paths. Only this presentation layer turns
// those paths into short-lived bearer URLs after the caller has been authorized.
export function presentMessageMedia(value) {
  if (!value) return value;
  const message = typeof value.toObject === "function" ? value.toObject() : { ...value };

  if (isPrivatePath(message.image)) {
    const originalImagePath = message.image;
    message.imageOriginal = signed(originalImagePath);
    message.image = signed(originalImagePath, IMAGE_DISPLAY);
    message.imageThumbnail = signed(originalImagePath, IMAGE_THUMBNAIL);
  }
  if (isPrivatePath(message.video)) {
    const rawVideoPath = message.video;
    message.video = signed(rawVideoPath);
    message.videoThumbnail = getSignedMediaUrl(`${rawVideoPath}/ik-thumbnail.jpg`, VIDEO_THUMBNAIL);
  }
  if (isPrivatePath(message.audio)) message.audio = signed(message.audio);
  if (isPrivatePath(message.file)) {
  const originalFilePath = message.file;

  message.file = signed(originalFilePath);

  if (
    message.fileType === "application/pdf" ||
    message.fileName?.toLowerCase().endsWith(".pdf")
  ) {
    message.fileThumbnail = getSignedPdfThumbnailUrl(originalFilePath);
  }
}
  if (message.replyTo && typeof message.replyTo === "object") {
    message.replyTo = presentMessageMedia(message.replyTo);
  }
  return message;
}

export function presentMessagesMedia(messages) {
  return messages.map(presentMessageMedia);
}
