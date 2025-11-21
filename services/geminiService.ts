
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Message } from "../types";

const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Helper to clean text immediately upon receipt
const cleanTextResponse = (text: string) => {
  if (!text) return "";
  // Remove <think> tags and their content, case insensitive, multiline
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
};

// Define the image generation tool
const generateImageTool: FunctionDeclaration = {
  name: "generate_image",
  description: "Generate an image based on a text prompt. Use this when the user asks to draw, create, or generate an image.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: "The detailed description of the image to generate.",
      },
    },
    required: ["prompt"],
  },
};

interface GeminiResponse {
  text: string;
  image?: string;
}

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: string
): Promise<GeminiResponse> => {
  if (!ai) {
    throw new Error("Gemini API Key is missing");
  }

  // Convert internal message format to Gemini format
  const chatHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: chatHistory,
    config: {
      // System instruction reinforced with Japanese and English directives against thinking output
      systemInstruction: "You are Matcha AI, a helpful, friendly, and intelligent assistant. You answer concisely and politely. If the user speaks Japanese, reply in Japanese. If English, reply in English. \n\nIMPORTANT: Do NOT output internal thought processes, monologues, or <think> tags. Only output the final response to the user.\n\n重要: 思考プロセスや<think>タグは絶対に出力しないでください。ユーザーへの最終的な回答のみを出力してください。",
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ functionDeclarations: [generateImageTool] }],
    }
  });

  try {
    const result = await chat.sendMessage({ message: newMessage });
    
    // Check for function calls (Tool use)
    const functionCalls = result.functionCalls;
    
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      
      if (call.name === "generate_image") {
        const prompt = call.args['prompt'] as string;
        
        try {
          // Call Imagen model
          const imageResponse = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              aspectRatio: '1:1',
              outputMimeType: 'image/jpeg'
            }
          });

          const base64Image = imageResponse.generatedImages?.[0]?.image?.imageBytes;

          if (base64Image) {
            const imageUrl = `data:image/jpeg;base64,${base64Image}`;
            
            // Let Gemini know the function was executed (optional, but usually we just return the result to UI here for speed)
            // For this app, we'll construct the response directly.
            return {
              text: `「${prompt}」の画像を生成しました！`,
              image: imageUrl
            };
          } else {
            return { text: "画像の生成に失敗しました。" };
          }
        } catch (imgError) {
          console.error("Imagen Error:", imgError);
          return { text: "申し訳ありません。画像の生成中にエラーが発生しました。" };
        }
      }
    }

    const rawText = result.text || "";
    return { text: cleanTextResponse(rawText) };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "申し訳ありません。エラーが発生しました。(Sorry, an error occurred.)" };
  }
};
