
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

// Die API-Richtlinien verlangen die Nutzung von process.env.API_KEY.
// Wir fügen eine explizite Prüfung hinzu, um im Fehlerfall genauere Infos zu geben.
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

const FAST_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

function extractJSON(text: string) {
  try {
    // Suche nach dem ersten { und dem letzten }, um JSON aus Markdown-Antworten zu extrahieren
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    console.error("AI Response Text was:", text);
    throw new Error("Die KI-Antwort konnte nicht verarbeitet werden. Bitte versuche es erneut.");
  }
}

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Gib Wetterdaten für Koordinaten (${lat}, ${lon}) als JSON zurück: {uvIndex: number, pollution: string, humidity: string, temp: string}. Nutze Google Search für Echtzeitdaten.`,
      config: { 
        tools: [{ googleSearch: {} }]
      }
    });
    return extractJSON(response.text);
  } catch (e) {
    return { uvIndex: 1, pollution: "Normal", humidity: "50%", temp: "21°C" };
  }
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { 
        parts: [{ text: `Minimalist premium skincare product photography: ${description}. White background, soft studio light, 4k.` }] 
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
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
        { text: `Analysiere dieses Produkt für einen Nutzer mit Hautzielen: ${quiz.concerns.join(', ')}. Gib JSON zurück: {name, description, ingredients[], rating, suitability, personalReason}.` }
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
  
  if (Object.keys(images).length === 0) {
    throw new Error("Keine Bilder für die Analyse gefunden. Bitte starte den Scan erneut.");
  }

  if (onProgress) onProgress("Bilder werden analysiert...");
  const imageParts = Object.values(images).map(base64 => ({ 
    inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } 
  }));
  
  const prompt = `Führe eine dermatologische KI-Analyse durch.
    Profil: ${JSON.stringify(quiz)}.
    Umgebung: ${JSON.stringify(weather)}.
    Erstelle eine Morgen- und Abendroutine mit jeweils 3 Produkten.
    Antworte STRENG im JSON-Format: {overallScore, hydration, purity, skinType, morningRoutine:[{product, action, reason}], eveningRoutine:[{product, action, reason}], tips:[string]}.`;

  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: { responseMimeType: "application/json" }
  });

  if (onProgress) onProgress("Routine wird erstellt...");
  const data = extractJSON(response.text);
  
  const enrich = async (steps: any[]) => {
    if (!steps || !Array.isArray(steps)) return [];
    return await Promise.all(steps.slice(0, 3).map(async s => {
      try {
        const img = await generateProductImage(s.product);
        return { ...s, imageUrl: img };
      } catch (e) {
        return { ...s, imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400' };
      }
    }));
  };

  if (onProgress) onProgress("Visuals werden generiert...");
  const morningEnriched = await enrich(data.morningRoutine);
  const eveningEnriched = await enrich(data.eveningRoutine);
  
  return {
    ...data,
    morningRoutine: morningEnriched,
    eveningRoutine: eveningEnriched,
    overallScore: data.overallScore || 75,
    hydration: data.hydration || 65,
    purity: data.purity || 70,
    skinType: data.skinType || "Mischhaut",
    tips: data.tips && data.tips.length > 0 ? data.tips : ["Viel Wasser trinken", "LSF 50 nutzen"]
  } as SkinAnalysis;
}
