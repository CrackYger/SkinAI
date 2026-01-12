
import { GoogleGenAI, Type } from "@google/genai";
import { SkinAnalysis, QuizData, WeatherData, ScannedProduct, ProductSearchResult, RoutineAnalysis, RoutineStep } from "../types";

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

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&q=80&w=400', // Serum
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400', // Bottles
  'https://images.unsplash.com/photo-1571781926291-28b46c529131?auto=format&fit=crop&q=80&w=400', // Cream
  'https://images.unsplash.com/photo-1608248597279-f99d160bfbc8?auto=format&fit=crop&q=80&w=400', // Dropper
  'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&q=80&w=400'  // Minimalist
];

function getRandomFallbackImage() {
  return FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
}

export async function analyzeSkin(
  images: { [key: string]: string }, 
  quiz: QuizData, 
  weather?: WeatherData
): Promise<SkinAnalysis> {
  const ai = getAI();
  
  const imageParts = Object.entries(images).map(([key, base64]) => ({ 
    inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } 
  }));
  
  const systemInstruction = `Du bist ein hochstrenger dermatologischer Experte. 
    Analysiere die Hautbilder (Frontal, Links, Rechts) extrem detailliert.
    
    Ich benötige spezifische Metriken und VISUELLE KOORDINATEN für Probleme auf dem Frontal-Bild.
    Stell dir ein Koordinatensystem über dem Gesicht vor: X (0-100, links nach rechts), Y (0-100, oben nach unten).
    Identifiziere Zonen für:
    - Akne/Unreinheiten
    - Talg/Ölglanz (meist T-Zone)
    - Sonnenschäden/Pigmentierung
    
    Bewertungskriterien (0-100, wobei 100 PERFEKT ist):
    - Acne Score: 100 = Keine Pickel, 0 = Schwere Akne.
    - Sebum Score: 100 = Matt/Balanced, 0 = Extrem fettig.
    - Sun Damage Score: 100 = Keine Flecken, 0 = Starke Schäden.
    
    Gib auch die Routine zurück.
    Berücksichtige das Alter (${quiz.age}) und die genannten Probleme (${quiz.concerns.join(', ')}).`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts: [...imageParts, { text: "Führe die Analyse durch und gib alle Daten inklusive Koordinaten JSON zurück." }] },
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER },
            hydration: { type: Type.NUMBER },
            texture: { type: Type.NUMBER },
            purity: { type: Type.NUMBER },
            antiAging: { type: Type.NUMBER },
            
            // New specific metrics
            acneScore: { type: Type.NUMBER },
            sebumScore: { type: Type.NUMBER },
            sunDamageScore: { type: Type.NUMBER },
            
            skinType: { type: Type.STRING },
            summary: { type: Type.STRING },
            
            detectedIssues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "X Position in % (0-100)" },
                  y: { type: Type.NUMBER, description: "Y Position in % (0-100)" },
                  type: { type: Type.STRING, enum: ["acne", "sebum", "sunDamage", "wrinkles"] },
                  severity: { type: Type.NUMBER }
                }
              }
            },
            
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
          required: ["overallScore", "skinType", "acneScore", "sebumScore", "sunDamageScore", "detectedIssues", "morningRoutine", "eveningRoutine"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Keine Antwort von der KI erhalten.");
    
    const data = JSON.parse(text);
    
    // Process images sequentially
    const enrich = async (steps: any[]) => {
      const enrichedSteps = [];
      for (const s of steps) {
        try {
           const img = await generateProductImage(s.product);
           enrichedSteps.push({ ...s, imageUrl: img });
        } catch (e) {
           enrichedSteps.push({ ...s, imageUrl: getRandomFallbackImage() });
        }
      }
      return enrichedSteps;
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
    // Using a simpler prompt and smaller aspect ratio sometimes helps with latency/quota
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { 
        parts: [{ text: `Minimalist aesthetic skincare product bottle: ${description}. High key lighting, white background.` }] 
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part ? `data:image/png;base64,${part.inlineData.data}` : getRandomFallbackImage();
  } catch (e: any) {
    // Handle quota errors silently with fallback
    if (e.status === 429 || e?.error?.code === 429 || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED')) {
      // console.warn("Quota exceeded for image generation. Using fallback.");
    } else {
      console.error("Image Gen Error:", e);
    }
    return getRandomFallbackImage();
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

export async function findProducts(query: string): Promise<ProductSearchResult[]> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Suche nach 5 existierenden Skincare-Produkten, die zur Suche "${query}" passen.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
             type: Type.OBJECT,
             properties: {
               name: { type: Type.STRING },
               brand: { type: Type.STRING },
               type: { type: Type.STRING }
             }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function analyzeFullRoutine(
  morning: RoutineStep[],
  evening: RoutineStep[],
  quiz: QuizData
): Promise<RoutineAnalysis> {
  try {
    const ai = getAI();
    const prompt = `
      Analysiere diese Skincare-Routine für folgendes Profil:
      Alter: ${quiz.age}, Hautziele: ${quiz.concerns.join(', ')}, Typ: ${quiz.sensitivity}.
      
      Morgens: ${morning.map(m => m.product).join(', ')}
      Abends: ${evening.map(e => e.product).join(', ')}

      Prüfe auf:
      1. Wirkstoff-Konflikte (z.B. Retinol + Vitamin C gleichzeitig).
      2. Produkte die nicht zum Hauttyp passen.
      3. Überpflege oder fehlende Essentials (z.B. fehlender SPF).
      
      Gib einen Score (0-100) für die Routine-Qualität.
      Nenne Warnungen und schlage konkrete Alternativen für schlechte Produkte vor.
    `;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            warnings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  product: { type: Type.STRING },
                  issue: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["high", "medium", "low"] }
                }
              }
            },
            alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  badProduct: { type: Type.STRING },
                  betterAlternative: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return handleGeminiError(e);
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
    return JSON.parse(text);
  } catch (e) {
    // console.error("Weather fetch error:", e);
    return { uvIndex: 1, pollution: "Gut", humidity: "45%", temp: "21°C" };
  }
}
