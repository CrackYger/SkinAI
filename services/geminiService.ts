
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Use Flash for faster responses in UI-blocking operations
const FAST_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: `Wie ist der aktuelle UV-Index, die Luftverschmutzung (AQI), die Temperatur und die Luftfeuchtigkeit an diesen Koordinaten: Latitude ${lat}, Longitude ${lon}? Gib nur die Werte als JSON zurück.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          uvIndex: { type: Type.NUMBER },
          pollution: { type: Type.STRING },
          humidity: { type: Type.STRING },
          temp: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}") as WeatherData;
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [{ text: `High-end, photorealistic product photography of a premium skincare item: ${description}. Soft studio lighting, minimalist apple-style background, 4k resolution, clean design.` }]
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Image generation failed for:", description, error);
  }
  // Fallback to a nice generic skincare image if generation fails
  return 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
}

export async function analyzeProduct(imageData: string, quiz: QuizData): Promise<ScannedProduct> {
  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
        { text: `Analysiere dieses Skincare-Produkt im Detail. Beziehe dich auf das Profil des Nutzers: Alter ${quiz.age}, Hautziele: ${quiz.concerns.join(', ')}, Sensibilität: ${quiz.sensitivity}. 
          Bewerte Inhaltsstoffe und Eignung. Gib JSON zurück.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          rating: { type: Type.NUMBER },
          suitability: { type: Type.STRING },
          personalReason: { type: Type.STRING }
        },
        required: ["name", "description", "rating", "suitability", "personalReason"]
      }
    }
  });

  const analysis = JSON.parse(response.text || "{}");
  // Only generate image if we got a valid name
  const imageUrl = analysis.name ? await generateProductImage(analysis.name) : 'https://images.unsplash.com/photo-1556229167-7313098f980e?auto=format&fit=crop&q=80&w=400';
  return { ...analysis, imageUrl };
}

export async function analyzeSkin(
  images: { [key: string]: string }, 
  quiz: QuizData, 
  weather?: WeatherData,
  onProgress?: (msg: string) => void
): Promise<SkinAnalysis> {
  if (onProgress) onProgress("Hautdaten werden verarbeitet...");
  
  const imageParts = Object.values(images).map(base64 => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64.split(',')[1]
    }
  }));

  const prompt = `
    Analysiere diese Hautbilder und Profildaten.
    NUTZER: Alter ${quiz.age}, Ziele: ${quiz.concerns.join(", ")}, Stress: ${quiz.lifestyle}, Schlaf: ${quiz.sleepHours}, Wasser: ${quiz.waterIntake}, Empfindlichkeit: ${quiz.sensitivity}.
    WETTER: UV ${weather?.uvIndex || "unbekannt"}, Feuchtigkeit ${weather?.humidity || "unbekannt"}.

    ANFORDERUNGEN:
    1. Erstelle eine MINIMALISTISCHE Routine (max 4 Schritte).
    2. Achte auf Wirkstoff-Kompatibilität.
    3. Gib präzise Begründungen.
    4. Wenn nötig, erstelle eine alternierende Routine (isAlternating: true).
    
    Gib das Ergebnis als JSON zurück.
  `;

  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER },
          hydration: { type: Type.NUMBER },
          texture: { type: Type.NUMBER },
          purity: { type: Type.NUMBER },
          antiAging: { type: Type.NUMBER },
          skinType: { type: Type.STRING },
          summary: { type: Type.STRING },
          isAlternating: { type: Type.BOOLEAN },
          morningRoutine: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { product: { type: Type.STRING }, action: { type: Type.STRING }, reason: { type: Type.STRING } } } },
          eveningRoutine: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { product: { type: Type.STRING }, action: { type: Type.STRING }, reason: { type: Type.STRING } } } },
          morningRoutineB: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { product: { type: Type.STRING }, action: { type: Type.STRING }, reason: { type: Type.STRING } } } },
          eveningRoutineB: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { product: { type: Type.STRING }, action: { type: Type.STRING }, reason: { type: Type.STRING } } } },
          tips: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["overallScore", "skinType", "morningRoutine", "eveningRoutine", "tips", "isAlternating"]
      }
    }
  });

  if (onProgress) onProgress("Produkt-Visuals werden generiert...");
  const data = JSON.parse(response.text || "{}");
  
  // Enrich images in parallel for better performance
  const enrich = async (steps: any[]) => {
    if (!steps || steps.length === 0) return [];
    // Limit to 4 parallel generations to avoid quota issues
    return await Promise.all(steps.slice(0, 4).map(async s => ({
      ...s,
      imageUrl: await generateProductImage(s.product)
    })));
  };

  data.morningRoutine = await enrich(data.morningRoutine);
  data.eveningRoutine = await enrich(data.eveningRoutine);
  
  if (data.isAlternating) {
    data.morningRoutineB = await enrich(data.morningRoutineB);
    data.eveningRoutineB = await enrich(data.eveningRoutineB);
  }

  return data as SkinAnalysis;
}
