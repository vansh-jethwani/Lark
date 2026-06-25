import ImageKit from "@imagekit/nodejs";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
})

function hasImagekitConfig() {
    return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

// originalName= "My Photo (1).png"
// result: "chat-1749300000000-My_Photo_1_.png"
// this helper makes a safe, unique filename for uploaded files.
function createFileName(originalName = "upload") {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `chat-${Date.now()}-${safeName}`;
}
async function uploadChatMedia(file) {
    const fileName = createFileName(file.originalname);
    const result = await imagekit.files.upload({
        file: file.buffer,
        fileName,
        folder: "/chat",
    });
    return result.url;
}



export { uploadChatMedia, hasImagekitConfig }