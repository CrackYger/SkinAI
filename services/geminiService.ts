
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

// Always use process.env.API_KEY for initialization as per guidelines.
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const FAST_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

function extractJSON(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", text);
    throw new Error("KI_FORMAT_ERROR");
  }
}

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    const ai = getAI();
    // Using gemini-3-flash-preview with googleSearch for real-time weather data.
    // We omit responseMimeType as search grounding responses might contain grounded citations or metadata.
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Wetterdaten für Lat ${lat}, Lon ${lon} als JSON (uvIndex, pollution, humidity, temp).`,
      config: { 
        tools: [{ googleSearch: {} }]
      }
    });
    // extractJSON handles finding the JSON block within the response text.
    return extractJSON(response.text);
  } catch (e) {
    return { uvIndex: 1, pollution: "Gut", humidity: "50%", temp: "21°C" };
  }
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const ai = getAI();
    // Image generation using gemini-2.5-flash-image.
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { 
        parts: [{ text: `Professional minimalist product photography of a premium skincare bottle: ${description}. Soft studio lighting, neutral background, 4k, high-end design.` }] 
      },
      config: { 
        imageConfig: { aspectRatio: "1:1" } 
      }
    });
    // Correctly iterate through parts to find the image part.
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part ? `data:image/png;base64,${part.inlineData.data}` : 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
  } catch (e) {
    return 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
  }
}

export async function analyzeProduct(imageData: string, quiz: QuizData): Promise<ScannedProduct> {
  const ai = getAI();
  // Using gemini-3-flash-preview for vision-based product analysis.
  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
        { text: `Analysiere dieses Skincare-Produkt für ein Profil: ${JSON.stringify(quiz)}. Gib JSON zurück: {name, description, ingredients[], rating, suitability, personalReason}.` }
      ]
    },
    config: { responseMimeType: "application/json" }
  });

  const analysis = extractJSON(response.text);
  const imageUrl = await generateProductImage(analysis.name || "Skincare Product");
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
  
  const prompt = `Analysiere diese Hautscans im Detail. 
    NUTZERPROFIL: ${JSON.stringify(quiz)}. 
    WETTER: ${JSON.stringify(weather)}. 
    ERSTELLE: 
    1. Score (0-100)
    2. Hauttyp (z.B. Ölig, Mischhaut)
    3. Morgenroutine (3 Schritte)
    4. Abendroutine (3 Schritte)
    5. 3 spezifische Tipps.
    
    GIB NUR VALIDES JSON ZURÜCK: {overallScore, hydration, purity, skinType, morningRoutine:[{product, action, reason}], eveningRoutine:[{product, action, reason}], tips:[]}.`;

  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: { responseMimeType: "application/json" }
  });

  if (onProgress) onProgress("Routine wird erstellt...");
  const data = extractJSON(response.text);
  
  // Enrich steps with high-quality generated product visuals.
  const enrich = async (steps: any[]) => {
    if (!steps || !Array.isArray(steps)) return [];
    return await Promise.all(steps.slice(0, 3).map(async s => {
      const img = await generateProductImage(s.product);
      return { ...s, imageUrl: img };
    }));
  };

  if (onProgress) onProgress("Visuals werden generiert...");
  const morningEnriched = await enrich(data.morningRoutine);
  const eveningEnriched = await enrich(data.eveningRoutine);
  
  return {
    ...data,
    morningRoutine: morningEnriched,
    eveningRoutine: eveningEnriched,
    overallScore: data.overallScore || 80,
    hydration: data.hydration || 75,
    purity: data.purity || 70,
    skinType: data.skinType || "Mischhaut",
    tips: data.tips || ["Viel Wasser trinken", "LSF 50 nutzen"]
  } as SkinAnalysis;
}
