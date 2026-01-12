
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct } from "../types";

// Helper to initialize the Gemini API client with the environment API key
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

// Use gemini-3-pro-preview for complex reasoning tasks
const TEXT_MODEL = 'gemini-3-pro-preview';
// Use gemini-2.5-flash-image for image generation tasks
const IMAGE_MODEL = 'gemini-2.5-flash-image';

// Unified error handler for Gemini API calls, specifically handling key selection issues
const handleGeminiError = (err: any) => {
  if (err.message?.includes("Requested entity was not found.")) {
    if (typeof window !== 'undefined' && (window as any).aistudio?.openSelectKey) {
      (window as any).aistudio.openSelectKey();
    }
  }
  console.error("Gemini API Error:", err);
  throw err;
};

export async function analyzeSkin(
  images: { [key: string]: string }, 
  quiz: QuizData, 
  weather?: WeatherData
): Promise<SkinAnalysis> {
  const ai = getAI();
  
  const imageParts = Object.entries(images).map(([key, base64]) => ({ 
    inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } 
  }));
  
  const systemInstruction = `Du bist ein hochstrenger dermatologischer Experte. Deine Aufgabe ist es, die Haut auf den drei Bildern (Frontal, Links, Rechts) KRITISCH und GNADENLOS zu bewerten. 
    Ignoriere keine Makel. Suche gezielt nach:
    1. Verstopften Poren und Mitessern (T-Zone).
    2. Hyperpigmentierung und UV-Schäden.
    3. Feinen Linien, Krähenfüßen oder Elastizitätsverlust.
    4. Rötungen, Entzündungen oder Anzeichen von Barrierestörung.
    5. Texturunreinheiten und Schuppenbildung.
    Sei ehrlich, auch wenn es wehtut. Ein Score von 100 ist praktisch unmöglich. Gib dermatologisch fundierte Gründe für deine Bewertung an. 
    Berücksichtige das Alter (${quiz.age}) und die genannten Probleme (${quiz.concerns.join(', ')}).`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts: [...imageParts, { text: "Analysiere diese Hautbilder basierend auf deinen Instruktionen." }] },
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER, description: "Maximal 100, sei sehr kritisch." },
            hydration: { type: Type.NUMBER },
            texture: { type: Type.NUMBER },
            purity: { type: Type.NUMBER },
            antiAging: { type: Type.NUMBER },
            skinType: { type: Type.STRING },
            summary: { type: Type.STRING, description: "Ehrliche, kritische Zusammenfassung der Schwachstellen." },
            morningRoutine: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  product: { type: Type.STRING },
                  action: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            },
            eveningRoutine: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  product: { type: Type.STRING },
                  action: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["overallScore", "skinType", "morningRoutine", "eveningRoutine", "summary"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Keine Antwort von der KI erhalten.");
    
    const data = JSON.parse(text);
    
    const enrich = async (steps: any[]) => {
      return await Promise.all(steps.map(async s => {
        try {
          const img = await generateProductImage(s.product);
          return { ...s, imageUrl: img };
        } catch (e) {
          return { ...s };
        }
      }));
    };

    return {
      ...data,
      morningRoutine: await enrich(data.morningRoutine || []),
      eveningRoutine: await enrich(data.eveningRoutine || [])
    } as SkinAnalysis;
  } catch (err) {
    return handleGeminiError(err);
  }
}

export async function generateProductImage(description: string): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { 
        parts: [{ text: `A professional aesthetic skincare product photography: ${description}. White background, premium packaging.` }] 
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    // Iterate through parts to find the image as per guidelines
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part ? `data:image/png;base64,${part.inlineData.data}` : '';
  } catch (e) {
    console.error("Image Gen Error:", e);
    return 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400';
  }
}

export async function analyzeProduct(imageData: string, quiz: QuizData): Promise<ScannedProduct> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageData.split(',')[1] } },
          { text: `Analysiere dieses Kosmetikprodukt basierend auf den Nutzerdaten: ${JSON.stringify(quiz)}. Sei kritisch bei bedenklichen Inhaltsstoffen.` }
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
          required: ["name", "description", "ingredients", "rating", "suitability", "personalReason"]
        }
      }
    });

    const analysis = JSON.parse(response.text || "{}");
    const imageUrl = await generateProductImage(analysis.name);
    return { ...analysis, imageUrl };
  } catch (err) {
    return handleGeminiError(err);
  }
}

export async function getRealtimeWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Gib aktuelle Wetterdaten für Standort (Lat: ${lat}, Lon: ${lon}) in JSON zurück.`,
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
          },
          required: ["uvIndex", "pollution", "humidity", "temp"]
        }
      }
    });
    
    let text = response.text || "{}";
    // Extracting grounding info if present, although not displayed in current UI
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) console.debug("Weather Search Grounding Chunks:", chunks);

    return JSON.parse(text);
  } catch (e) {
    console.error("Weather fetch error:", e);
    return { uvIndex: 1, pollution: "Gut", humidity: "45%", temp: "21°C" };
  }
}
