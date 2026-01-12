
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  // Sicherstellen, dass der Key wirklich vorhanden ist und nicht nur als String "undefined" vorliegt
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    console.error("Gemini API Key is missing in process.env.API_KEY");
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

function extractJSON(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    console.error("Raw AI response:", text);
    throw new Error("Fehler bei der Datenverarbeitung.");
  }
}

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Gib Wetterdaten für (${lat}, ${lon}) als JSON: {uvIndex: number, pollution: string, humidity: string, temp: string}. Nutze Google Search.`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return extractJSON(response.text);
  } catch (e) {
    return { uvIndex: 1, pollution: "Gut", humidity: "45%", temp: "22°C" };
  }
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { 
        parts: [{ text: `High-end skincare product: ${description}. Soft daylight, minimalist aesthetic, white studio background.` }] 
      },
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
    model: TEXT_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
        { text: `Analysiere dieses Produkt für Hautziele: ${quiz.concerns.join(', ')}. Gib JSON zurück: {name, description, ingredients[], rating, suitability, personalReason}.` }
      ]
    },
    config: { responseMimeType: "application/json" }
  });

  const analysis = extractJSON(response.text);
  const imageUrl = await generateProductImage(analysis.name || "Skin Product");
  return { ...analysis, imageUrl };
}

export async function analyzeSkin(
  images: { [key: string]: string }, 
  quiz: QuizData, 
  weather?: WeatherData,
  onProgress?: (msg: string) => void
): Promise<SkinAnalysis> {
  const ai = getAI();
  
  if (onProgress) onProgress("KI analysiert Texturen...");
  const imageParts = Object.values(images).map(base64 => ({ 
    inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } 
  }));
  
  const prompt = `Analysiere Hautzustand. Profil: ${JSON.stringify(quiz)}. Wetter: ${JSON.stringify(weather)}.
    Erstelle Morgen- und Abendroutine (je 3 Produkte).
    JSON: {overallScore, hydration, purity, skinType, morningRoutine:[{product, action, reason}], eveningRoutine:[{product, action, reason}], tips:[string]}.`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: { responseMimeType: "application/json" }
  });

  if (onProgress) onProgress("Routine wird visualisiert...");
  const data = extractJSON(response.text);
  
  const enrich = async (steps: any[]) => {
    if (!steps) return [];
    return await Promise.all(steps.slice(0, 3).map(async s => ({
      ...s, imageUrl: await generateProductImage(s.product)
    })));
  };

  const morningEnriched = await enrich(data.morningRoutine);
  const eveningEnriched = await enrich(data.eveningRoutine);
  
  return {
    ...data,
    morningRoutine: morningEnriched,
    eveningRoutine: eveningEnriched,
    overallScore: data.overallScore || 80,
    hydration: data.hydration || 70,
    purity: data.purity || 75,
    skinType: data.skinType || "Mischhaut",
    tips: data.tips || ["Viel Wasser trinken", "LSF 50 nutzen"]
  } as SkinAnalysis;
}
