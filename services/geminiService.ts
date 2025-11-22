
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Message } from "../types";

// --- API Key Config ---
// GeminiのAPIキーをここに記述します (ai.env の代わり)
const GEMINI_API_KEY = "AIzaSyAROjfHu5KtJZeUtvAfnq6ZCUdli1VucG8"; 

// 環境変数または上記の定数を使用
const apiKey = GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY" ? GEMINI_API_KEY : process.env.API_KEY;
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
    console.error("Gemini API Key is missing. Please set it in services/geminiService.ts");
    return { text: "APIキーが設定されていません。services/geminiService.tsを確認してください。" };
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
    // Clean the incoming text before processing
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
            
            // Return combined response
            return {
              text: `「${prompt}」の画像を生成しました！`,
              image: imageUrl
            };
          } else {
            return { text: "画像を生成できませんでした。" };
          }
        } catch (imgError) {
          console.error("Imagen Error:", imgError);
          return { text: "申し訳ありません。画像の生成中にエラーが発生しました。" };
        }
      }
    }

    const rawText = result.text || "";
    // Immediate cleaning
    return { text: cleanTextResponse(rawText) };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "申し訳ありません。エラーが発生しました。(Sorry, an error occurred.)" };
  }
};
