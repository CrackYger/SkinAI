
import { createClient } from '@supabase/supabase-js';

// Access variables from process.env as per environment guidelines
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Only initialize if keys are valid strings, otherwise export null to avoid hard crash
export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== "undefined" && supabaseAnonKey !== "undefined")
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
