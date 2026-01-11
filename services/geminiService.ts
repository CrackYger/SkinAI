
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey });
};

const FAST_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

function extractJSON(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    throw new Error("INVALID_AI_RESPONSE");
  }
}

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Wetterdaten für Lat ${lat}, Lon ${lon} als JSON (uvIndex, pollution, humidity, temp).`,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
    });
    return extractJSON(response.text);
  } catch (e) {
    return { uvIndex: 1, pollution: "Gut", humidity: "50%", temp: "20°C" };
  }
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: `High-end skincare product: ${description}. Soft lighting, photorealistic, premium design.` }] },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part ? `data:image/png;base64,${part.inlineData.data}` : 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
  } catch (e) {
    return 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
  }
}

export async function analyzeProduct(imageData: string, quiz: QuizData): Promise<ScannedProduct> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
        { text: `Analysiere Produktbild. Nutzer: ${JSON.stringify(quiz)}. Gib JSON: name, description, ingredients[], rating(1-10), suitability, personalReason.` }
      ]
    },
    config: { responseMimeType: "application/json" }
  });

  const analysis = extractJSON(response.text);
  const imageUrl = await generateProductImage(analysis.name || "Pflegeprodukt");
  return { ...analysis, imageUrl };
}

export async function analyzeSkin(
  images: { [key: string]: string }, 
  quiz: QuizData, 
  weather?: WeatherData,
  onProgress?: (msg: string) => void
): Promise<SkinAnalysis> {
  const ai = getAI();
  if (onProgress) onProgress("Bilder werden analysiert...");
  const imageParts = Object.values(images).map(base64 => ({ inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } }));
  
  const prompt = `Analysiere Gesichtsscan. Nutzer: ${JSON.stringify(quiz)}. Wetter: ${JSON.stringify(weather)}. Gib JSON: overallScore, hydration, purity, skinType, morningRoutine[product, action, reason], eveningRoutine[product, action, reason], tips[].`;

  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: { responseMimeType: "application/json" }
  });

  if (onProgress) onProgress("Routine wird generiert...");
  const data = extractJSON(response.text);
  
  const enrich = async (steps: any[]) => {
    if (!steps) return [];
    return await Promise.all(steps.slice(0, 3).map(async s => ({ ...s, imageUrl: await generateProductImage(s.product) })));
  };

  data.morningRoutine = await enrich(data.morningRoutine);
  data.eveningRoutine = await enrich(data.eveningRoutine);
  
  return data as SkinAnalysis;
}
