
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

// Use gemini-3-pro-preview for complex reasoning tasks (Skin Analysis)
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
  
  const systemInstruction = `Du bist ein Weltklasse-Dermatologe und Skincare-Formulierer. 
    Deine Aufgabe:
    1. Analysiere die Hautbilder (Frontal, Links, Rechts) auf klinischem Niveau.
    2. Erstelle eine PERFEKTE Routine.
    
    WICHTIG FÜR DIE ROUTINE:
    - Vermeide strikt Konflikte (z.B. KEIN Retinol gleichzeitig mit Vitamin C oder starken Säuren in derselben Routine-Zeit).
    - Trenne aktive Wirkstoffe: Vitamin C morgens, Retinol/Säuren abends.
    - Berücksichtige das Alter (${quiz.age}) und Hautziele (${quiz.concerns.join(', ')}).
    - Wenn die Haut sensibel ist, wähle sanfte Alternativen (z.B. Bakuchiol statt Retinol, PHA statt AHA).
    - Die Routine muss realistisch und effektiv sein.
    
    VISUELLE ANALYSE:
    Nutze ein Koordinatensystem (X 0-100, Y 0-100) für das Frontalbild um Probleme zu lokalisieren.
    
    Bewertungskriterien (0-100, 100 = Perfekt):
    - Acne Score: 100 = Rein, 0 = Akne.
    - Sebum Score: 100 = Ausgeglichen, 0 = Ölig/Trocken.
    - Sun Damage: 100 = Makellos, 0 = Stark geschädigt.
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts: [...imageParts, { text: "Führe die Analyse durch und gib das Ergebnis als JSON zurück." }] },
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
    
    // Process images in parallel for speed!
    const enrich = async (steps: any[]) => {
      return Promise.all(steps.map(async (s) => {
        try {
           const img = await generateProductImage(s.product);
           return { ...s, imageUrl: img };
        } catch (e) {
           return { ...s, imageUrl: getRandomFallbackImage() };
        }
      }));
    };

    const [morning, evening] = await Promise.all([
        enrich(data.morningRoutine || []),
        enrich(data.eveningRoutine || [])
    ]);

    return {
      ...data,
      morningRoutine: morning,
      eveningRoutine: evening
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
        parts: [{ text: `High-end skincare product photography, minimalist bottle, white background, studio lighting: ${description}` }] 
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part ? `data:image/png;base64,${part.inlineData.data}` : getRandomFallbackImage();
  } catch (e: any) {
    // Handle quota errors silently with fallback
    // if (e.status === 429 || e?.error?.code === 429 || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED')) {
      // console.warn("Quota exceeded for image generation. Using fallback.");
    // } else {
    //   console.error("Image Gen Error:", e);
    // }
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
      Du bist ein erfahrener kosmetischer Chemiker. Validiere diese Routine.
      HINWEIS: Ein Teil dieser Routine wurde bereits basierend auf einer Hautanalyse erstellt. Sei also nicht überkritisch bei Standard-Kombinationen, sondern suche nach ECHTEN Fehlern oder GEFÄHRLICHEN Konflikten.
      
      Nutzer-Profil:
      Alter: ${quiz.age}, Hautziele: ${quiz.concerns.join(', ')}, Typ: ${quiz.sensitivity}.
      
      Morgens: ${morning.map(m => m.product).join(', ')}
      Abends: ${evening.map(e => e.product).join(', ')}

      Aufgaben:
      1. Prüfe auf chemische Inkompatibilitäten (z.B. Retinol + AHA zur gleichen Zeit -> schlecht. Aber AHA morgens, Retinol abends -> gut).
      2. Prüfe ob der Sonnenschutz (SPF) fehlt. Das ist ein kritischer Fehler.
      3. Schlage Alternativen vor, wenn ein Produkt für ${quiz.sensitivity} Haut ungeeignet ist.
      
      Gib einen Score (0-100). 90-100 ist eine sichere, gute Routine.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Switch to Flash for speed!
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
