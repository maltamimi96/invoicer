/**
 * Run once to apply pending migrations.
 * Usage: node scripts/migrate.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const migrations = [
  "supabase/migrations/20260403_pdf_settings.sql",
  "supabase/migrations/20260403_customer_hub.sql",
];

for (const file of migrations) {
  const sql = readFileSync(resolve(__dirname, "..", file), "utf8");
  console.log(`\nRunning: ${file}`);
  const { error } = await supabase.rpc("exec_sql", { sql }).catch(() => ({ error: null }));
  if (error) {
    // Fall back to direct REST call with service role
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql }),
      },
    );
    if (!res.ok) {
      // Try the pg endpoint directly
      const pgRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: sql }),
        },
      );
      console.log(pgRes.ok ? `  ✓ Done` : `  ✗ Error: ${await pgRes.text()}`);
    } else {
      console.log(`  ✓ Done`);
    }
  } else {
    console.log(`  ✓ Done`);
  }
}
