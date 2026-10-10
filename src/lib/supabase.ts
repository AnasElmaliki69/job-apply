import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function getBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key === "YOUR_PUBLIC_ANON_KEY") throw new Error("Add your Supabase URL and public anon key to .env.local, then restart the app.");
  client = createClient(url, key);
  return client;
}
