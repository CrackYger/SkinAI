
export interface SkinAnalysis {
  overallScore: number;
  hydration: number;
  texture: number;
  purity: number;
  antiAging: number;
  skinType: string;
  summary: string;
  morningRoutine: RoutineStep[];
  eveningRoutine: RoutineStep[];
  morningRoutineB?: RoutineStep[];
  eveningRoutineB?: RoutineStep[];
  tips: string[];
  isAlternating: boolean;
}

export interface RoutineStep {
  product: string;
  action: string;
  reason: string;
  imageUrl?: string;
  isCustom?: boolean;
}

export interface ScannedProduct {
  name: string;
  description: string;
  ingredients: string[];
  rating: number; // 1-10
  suitability: string; // "Sehr gut", "Moderat", "Nicht empfohlen"
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

export interface DailyProgress {
  date: string;
  score: number;
  stress: number;
  skinFeeling: number;
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
  lastActiveDate?: string;
}

export type AppStep = 'welcome' | 'scan' | 'quiz' | 'analyzing' | 'result' | 'care' | 'profile' | 'daily_scan' | 'product_scan' | 'product_result';

export interface ScanStep {
  label: string;
  instruction: string;
  id: 'front' | 'left' | 'right';
}
