import multer from "multer";


const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25mb


export const upload = multer({
    // store file in ram
    storage: multer.memoryStorage(),

    // file size limit
    limits: { fileSize: MAX_FILE_SIZE },

    // file type filter
    fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");
        if (!isImage && !isVideo) {
            cb(new Error("Only image and video uploads are allowed"));
            return;
        }
        cb(null, true);
    },
});