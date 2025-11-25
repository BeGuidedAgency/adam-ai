import { createClient } from "@supabase/supabase-js";

// Debug: see what env vars Next actually sees
console.log("SUPABASE URL (NEXT_PUBLIC):", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("SUPABASE ANON (NEXT_PUBLIC):", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log("SUPABASE URL (SERVER):", process.env.SUPABASE_URL);
console.log("SUPABASE ANON (SERVER):", process.env.SUPABASE_ANON_KEY);

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Supabase URL env var is missing");
}
if (!supabaseAnonKey) {
  throw new Error("Supabase anon key env var is missing");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
