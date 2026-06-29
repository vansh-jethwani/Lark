import AiMessage from "../models/aiMessage.model.js";
import { gemini } from "../lib/gemini.js";
import { hasImagekitConfig, uploadChatMedia } from "../lib/imagekit.js";

function fileToBase64(file) {
    return file.buffer.toString("base64");
}

export async function getAIMessages(req, res) {
    try {
        const messages = await AiMessage.find({ userId: req.userId }).sort({ createdAt: 1 });
        return res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getAIMessages:", error.message);
        return res.status(500).json({ message: "Failed to load AI messages." });
    }
}

export async function chatWithAI(req, res) {
    try {
        const userId = req.userId;
        const { message } = req.body;
        const uploadedFile = req.file;

        console.log(req.file);
        console.log(req.body);

        if (!message?.trim() && !uploadedFile) {
            return res.status(400).json({ message: "Message or file is required." });
        }

        let fileUrl = "";
        let fileName = "";
        let fileType = "";
        let fileSize = 0;

        if (uploadedFile) {
            if (!hasImagekitConfig()) {
                return res.status(503).json({ message: "File upload is not configured." });
            }

            fileUrl = await uploadChatMedia(uploadedFile);
            fileName = uploadedFile.originalname;
            fileType = uploadedFile.mimetype;
            fileSize = uploadedFile.size;
        }

        const userMessage = await AiMessage.create({
            userId,
            role: "user",
            text: message?.trim() || "",
            file: fileUrl,
            fileName,
            fileType,
            fileSize,
        });

        const previousMessages = await AiMessage.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10);

        const history = previousMessages
            .reverse()
            .filter((msg) => msg.text)
            .map((msg) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.text }],
            }));

        const currentParts = [];

        currentParts.push({
            text:
                message?.trim() ||
                `User uploaded a file named ${fileName}. Analyze it if possible.`,
        });

        if (uploadedFile?.mimetype?.startsWith("image/")) {
            currentParts.push({
                inlineData: {
                    mimeType: uploadedFile.mimetype,
                    data: fileToBase64(uploadedFile),
                },
            });
        } else if (uploadedFile) {
            currentParts.push({
                text: `The user uploaded a file:
File name: ${fileName}
File type: ${fileType}
File size: ${fileSize} bytes.
File URL: ${fileUrl}

If you cannot directly read this file, tell the user what kind of file it is and ask them to paste the text/content they want analyzed.`,
            });
        }

        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `
You are Lark AI, the built-in AI assistant of the Lark messaging application.

Answer rules:
- Answer ONLY what the user asks.
- Keep answers short by default.
- Do not add extra sections unless the user asks.
- Do not add helper functions, testing code, main function, or explanations unless the user asks.
- If the user asks for code, give only the required code first.
- Add explanation only if the user asks "explain".
- For programming answers, prefer the shortest correct solution.
- Use Markdown formatting.

Your personality:
- Friendly and professional.
- Clear and concise.
- Never mention that you are Gemini unless the user explicitly asks.
- Behave as if you are a native feature of the Lark application.

Response style:
- Do NOT begin every answer with phrases like:
  - "Sure!"
  - "Certainly!"
  - "Okay!"
  - "Let's break it down."
  - "I'd be happy to help."

- Start answering immediately.

Formatting:
- Use Markdown.
- Use headings when appropriate.
- Use bullet points for lists.
- Use numbered lists for steps.
- Use tables when comparing things.
- Bold important keywords.
- Use code blocks with language names for programming.
- Keep paragraphs short and readable.

Programming:
- Explain code clearly.
- Always format code using fenced Markdown.

Images:
- If an image is uploaded, analyze it in detail.
- Mention visible objects, text, diagrams, and explain them naturally.

Documents:
- Summarize PDFs and documents.
- Extract important points.
- Answer questions about document content.

General:
- Be accurate.
- Don't invent information.
- If uncertain, say so.
`
                        },
                    ],
                },
                ...history,
                {
                    role: "user",
                    parts: currentParts,
                },
            ],
        });

        const aiText = response.text || "Sorry, I could not process that file.";

        const aiMessage = await AiMessage.create({
            userId,
            role: "assistant",
            text: aiText,
        });

        return res.status(201).json({ userMessage, aiMessage });
    } catch (error) {
        console.log("Error in chatWithAI:", error);
        return res.status(500).json({
            message: error.message || "Failed to chat with AI.",
        });
    }
}