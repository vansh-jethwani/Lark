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


export const upload = multer({
    // store file in ram
    storage: multer.memoryStorage(),

    // file size limit
    limits: { fileSize: MAX_FILE_SIZE },

    // file type filter
    fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");
        const isAudio = file.mimetype.startsWith("audio/");
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
