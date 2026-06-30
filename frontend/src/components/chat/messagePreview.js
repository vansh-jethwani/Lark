export function getMessagePreview(message) {
  if (!message) return "";
  if (message.text) return message.text;
  if (message.fileName) return message.fileName;
  if (message.imageUrl || message.image) return "Photo";
  if (message.videoUrl || message.video) return "Video";
  if (message.audioUrl || message.audio) return "Voice message";
  if (message.fileUrl || message.file) return "Document";
  return "Media message";
}
