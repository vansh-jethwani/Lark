import ImageKit from "@imagekit/nodejs";

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
});

function hasImagekitConfig() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

function createFileName(originalName = "upload") {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `chat-${Date.now()}-${safeName}`;
}

async function uploadChatMedia(file) {
  if (!file?.buffer) {
    throw new Error("No file buffer found for ImageKit upload.");
  }

  const fileName = createFileName(file.originalname);

  const result = await imagekit.files.upload({
    file: file.buffer.toString("base64"),
    fileName,
    folder: "/chat",
  });

  return result.url;
}

export { uploadChatMedia, hasImagekitConfig };