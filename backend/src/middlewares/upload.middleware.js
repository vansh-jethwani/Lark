import multer from "multer";


const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25mb
const ALLOWED_FILE_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/csv",
];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"];


export const upload = multer({
    // store file in ram
    storage: multer.memoryStorage(),

    // file size limit
    limits: { fileSize: MAX_FILE_SIZE },

    // file type filter
    fileFilter: (req, file, cb) => {
        const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
        const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);
        const isAudio = ALLOWED_AUDIO_TYPES.includes(file.mimetype);
        const isDocument = ALLOWED_FILE_TYPES.includes(file.mimetype);
        if (!isImage && !isVideo && !isAudio && !isDocument) {
            cb(new Error("Only image, video, audio, and document uploads are allowed"));
            return;
        }
        cb(null, true);
    },
});

export function handleUploadError(error, req, res, next) {
    if (!error) {
        next();
        return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File is too large. Max size is 25MB." });
    }

    return res.status(400).json({ message: error.message || "Failed to upload media." });
}

// MIME types are supplied by the client. Validate signatures for formats with
// unambiguous headers; other supported media continues through unchanged.
export function validateUploadSignature(req, res, next) {
    const file = req.file || req.files?.media?.[0];
    if (!file?.buffer) return next();
    const header = file.buffer.subarray(0, 12);
    const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isGif = header.subarray(0, 6).toString("ascii") === "GIF87a" || header.subarray(0, 6).toString("ascii") === "GIF89a";
    const isWebp = header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
    const isPdf = header.subarray(0, 5).toString("ascii") === "%PDF-";
    if ((file.mimetype === "image/png" && !isPng) ||
        (file.mimetype === "image/jpeg" && !isJpeg) ||
        (file.mimetype === "image/gif" && !isGif) ||
        (file.mimetype === "image/webp" && !isWebp) ||
        (file.mimetype === "application/pdf" && !isPdf)) {
        return res.status(400).json({ message: "File contents do not match its declared type." });
    }
    return next();
}
