import {
  getSignedMediaUrl,
  getSignedPdfThumbnailUrl,
} from "./imagekit.js";
import { applyPhotoPrivacy } from "./privacy.js";

const IMAGE_DISPLAY = [{ width: 640, quality: "auto", format: "auto" }];
const IMAGE_THUMBNAIL = [{ width: 320, height: 320, cropMode: "maintain_ratio", quality: "auto", format: "auto" }];
const VIDEO_THUMBNAIL = [{ width: 640, quality: 80 }];

function isPrivatePath(value) {
  return typeof value === "string" && value.startsWith("/");
}

function toPrivatePath(value) {
  if (typeof value !== "string" || !value) return value;
  if (value.startsWith("/")) return value;
  // Legacy messages stored the full ImageKit URL (pre-fix uploads saved
  // result.url). Extract the file path so it can be served through
  // short-lived signed URLs exactly like new uploads.
  const endpoint = (process.env.IMAGEKIT_URL_ENDPOINT || "").replace(/\/$/, "");
  if (endpoint && value.startsWith(endpoint)) {
    const path = value.slice(endpoint.length).split("?")[0];
    return path.startsWith("/") ? path : `/${path}`;
  }
  return value;
}

function signed(value, transformation) {
  return isPrivatePath(value) ? getSignedMediaUrl(value, transformation) : value || "";
}

// Database fields retain ImageKit file paths. Only this presentation layer turns
// those paths into short-lived signed URLs after the caller has been authorized.
export function presentMessageMedia(value) {
  if (!value) return value;
  const message = typeof value.toObject === "function" ? value.toObject() : { ...value };

  // Normalize legacy full-URL fields to private paths so they get signed URLs.
  message.image = toPrivatePath(message.image);
  message.video = toPrivatePath(message.video);
  message.audio = toPrivatePath(message.audio);
  message.file = toPrivatePath(message.file);

  // E2EE: when the media bytes are client-encrypted (group keyVersion > 0),
  // ImageKit transformations cannot run on ciphertext — serve the raw signed
  // file and let the client decrypt it locally.
  const encryptedMedia = Number(message.keyVersion) > 0;

  if (isPrivatePath(message.image)) {
    const originalImagePath = message.image;
    if (encryptedMedia) {
      message.image = signed(originalImagePath);
    } else {
      message.imageOriginal = signed(originalImagePath);
      message.image = signed(originalImagePath, IMAGE_DISPLAY);
      message.imageThumbnail = signed(originalImagePath, IMAGE_THUMBNAIL);
    }
  }
  if (isPrivatePath(message.video)) {
    const rawVideoPath = message.video;
    message.video = signed(rawVideoPath);
    if (!encryptedMedia) {
      message.videoThumbnail = getSignedMediaUrl(`${rawVideoPath}/ik-thumbnail.jpg`, VIDEO_THUMBNAIL);
    }
  }
  if (isPrivatePath(message.audio)) message.audio = signed(message.audio);
  if (isPrivatePath(message.file)) {
    const originalFilePath = message.file;

    message.file = signed(originalFilePath);

    if (
      !encryptedMedia &&
      (
        message.fileType === "application/pdf" ||
        message.fileName?.toLowerCase().endsWith(".pdf")
      )
    ) {
      message.fileThumbnail = getSignedPdfThumbnailUrl(originalFilePath);
    }
  }
  if (message.replyTo && typeof message.replyTo === "object") {
    message.replyTo = presentMessageMedia(message.replyTo);
  }
  // Profile-photo privacy: a populated sender who chose "nobody" is shown
  // without a photo. (The populate must select the `privacy` field.)
  if (message.senderId && typeof message.senderId === "object") {
    message.senderId = applyPhotoPrivacy(message.senderId);
  }
  return message;
}

export function presentMessagesMedia(messages) {
  return messages.map(presentMessageMedia);
}
