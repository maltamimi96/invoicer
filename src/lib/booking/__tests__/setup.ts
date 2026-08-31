// Vitest setup — load env so DB-backed tests can reach a Supabase instance.
//
// Order matters. .env.local is what `npm run env:pull` fills with PRODUCTION
// values, so it is loaded LAST and only as a fallback. A .env.test.local (or
// .env.test) pointing at the local stack wins over it, which is what lets you
// keep a working .env.local for `npm run dev` without aiming the test suite at
// the live database.
//
// dotenv does not overwrite an already-set variable, so the first file to
// define a key is the one that takes effect.
//
// This ordering is a convenience, not the safety mechanism. The actual refusal
// to touch production lives in booking-db.test.ts's assertSafeTarget().
import { config } from "dotenv";

config({ path: ".env.test.local" });
config({ path: ".env.test" });
config({ path: ".env.local" });
config({ path: ".env" });
