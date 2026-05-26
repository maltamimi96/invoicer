// Vitest setup — load local env so DB-backed tests can reach Supabase.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
