
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
  tips: string[];
}

export interface RoutineStep {
  product: string;
  action: string;
  reason: string;
  imageUrl?: string;
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

export type AppStep = 'welcome' | 'scan' | 'quiz' | 'analyzing' | 'result' | 'care' | 'profile' | 'daily_scan' | 'product_scan' | 'product_result' | 'scan_hub';

export interface ScanStep {
  label: string;
  instruction: string;
  id: 'front' | 'left' | 'right';
}
