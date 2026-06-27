import AiMessage from "../models/aiMessage.model.js";
import { gemini } from "../lib/gemini.js";

export async function getAIMessages(req, res) {
  try {
    const userId = req.userId;

    const messages = await AiMessage.find({ userId }).sort({ createdAt: 1 });

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

    if (!message?.trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const userMessage = await AiMessage.create({
      userId,
      role: "user",
      text: message.trim(),
    });

    const previousMessages = await AiMessage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    const contents = previousMessages
      .reverse()
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.text }],
      }));

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You are Lark AI, a helpful AI assistant inside the Lark chat app. Keep replies useful, friendly, and concise.",
            },
          ],
        },
        ...contents,
      ],
    });

    const aiText = response.text || "Sorry, I could not generate a response right now.";

    const aiMessage = await AiMessage.create({
      userId,
      role: "assistant",
      text: aiText,
    });

    return res.status(201).json({
      userMessage,
      aiMessage,
    });
  } catch (error) {
    console.log("Error in chatWithAI:", error.message);
    return res.status(500).json({ message: "Failed to chat with AI." });
  }
}