
export interface SkinIssue {
  x: number; // 0-100 percentage from left
  y: number; // 0-100 percentage from top
  type: 'acne' | 'sebum' | 'sunDamage' | 'wrinkles';
  severity: number; // 0-1
}

export interface SkinAnalysis {
  overallScore: number;
  hydration: number;
  texture: number;
  purity: number;
  antiAging: number;
  // New specific metrics
  acneScore: number;
  sebumScore: number;
  sunDamageScore: number;
  
  skinType: string;
  summary: string;
  detectedIssues: SkinIssue[]; // Coordinates for visual overlay
  
  morningRoutine: RoutineStep[];
  eveningRoutine: RoutineStep[];
  tips: string[];
}

export interface RoutineStep {
  product: string;
  action: string;
  reason: string;
  imageUrl?: string;
  isCustom?: boolean; // Markiert vom Nutzer hinzugefügte Produkte
}

export interface RoutineAnalysis {
  score: number;
  summary: string;
  warnings: {
    product: string;
    issue: string;
    severity: 'high' | 'medium' | 'low';
  }[];
  alternatives: {
    badProduct: string;
    betterAlternative: string;
    reason: string;
  }[];
}

export interface ProductSearchResult {
  name: string;
  brand: string;
  type: string;
}

export interface ScannedProduct {
  name: string;
  description: string;
  ingredients: string[];
  rating: number; 
  suitability: string; 
  personalReason: string;
  imageUrl?: string;
}

export interface QuizData {
  age: string;
  concerns: string[];
  lifestyle: string;
  sunExposure: string;
  sensitivity: string;
  waterIntake: string;
  sleepHours: string;
}

export interface WeatherData {
  uvIndex: number;
  pollution: string;
  humidity: string;
  temp: string;
}

export interface UserSettings {
  darkMode: boolean;
  notifications: boolean;
  userName: string;
  skinTypeGoal: string;
  isSetupComplete: boolean;
  points: number;
  streak: number;
}

export type AppStep = 'welcome' | 'scan' | 'quiz' | 'analyzing' | 'result' | 'care' | 'profile' | 'daily_scan' | 'product_scan' | 'product_result' | 'scan_hub' | 'add_product';

export interface ScanStep {
  label: string;
  instruction: string;
  id: 'front' | 'left' | 'right';
}
