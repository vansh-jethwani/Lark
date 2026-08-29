import ImageKit from "@imagekit/nodejs";

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
});

function hasImagekitConfig() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);
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
    isPrivateFile: true,
    responseFields: ["isPrivateFile"],
  });

  return result.filePath;
}

function getSignedMediaUrl(filePath, transformation) {
  if (!filePath) return "";

  return imagekit.helper.buildSrc({
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    src: filePath,
    signed: true,
    expiresIn: 300,
    transformation,
  });
}

function getSignedPdfThumbnailUrl(filePath) {
  if (!filePath) return "";

  return imagekit.helper.buildSrc({
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    src: filePath,
    signed: true,
    expiresIn: 300,
    transformation: [
      {
        page: 1,
        width: 560,
        height: 360,
        cropMode: "maintain_ratio",
        quality: 80,
        format: "jpg",
      },
    ],
  });
}

export {
  uploadChatMedia,
  hasImagekitConfig,
  getSignedMediaUrl,
  getSignedPdfThumbnailUrl,
};
