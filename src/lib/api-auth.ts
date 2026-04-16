/**
 * Per-business API key authentication for external integrations.
 *
 * Keys are formatted as `inv_<32 hex chars>`.
 * Only the SHA-256 hash is stored in the database.
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApiScope } from "@/types/database";

export interface ApiKeyContext {
  businessId: string;
  userId: string;
  scopes: ApiScope[];
  keyId: string;
}

// ── Hashing ──────────────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Authenticate an incoming request using a per-business API key.
 *
 * Accepts either:
 *   - `Authorization: Bearer inv_xxx` (preferred)
 *   - `X-API-Key: inv_xxx` (convenience alias)
 *
 * Falls back to the legacy INTERNAL_API_KEY env var during migration.
 */
export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyContext | null> {
  // Extract key from headers
  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");

  let key: string | null = null;
  if (authHeader?.startsWith("Bearer inv_")) {
    key = authHeader.slice(7); // strip "Bearer "
  } else if (xApiKey?.startsWith("inv_")) {
    key = xApiKey;
  }

  // Per-business key lookup
  if (key) {
    const keyHash = await hashKey(key);
    const sb = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from("business_api_keys")
      .select("id, business_id, user_id, scopes, expires_at, revoked_at")
      .eq("key_hash", keyHash)
      .single();

    if (error || !data) return null;
    if (data.revoked_at) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

    // Fire-and-forget last_used_at update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any)
      .from("business_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});

    return {
      businessId: data.business_id,
      userId: data.user_id,
      scopes: data.scopes as ApiScope[],
      keyId: data.id,
    };
  }

  // ── Legacy fallback: INTERNAL_API_KEY ──────────────────────────────────────
  // Supports the old X-API-Key header with the shared env var.
  // Remove this block once all integrations have migrated to per-business keys.
  const legacyKey = xApiKey ?? authHeader?.slice(7);
  const expected = process.env.INTERNAL_API_KEY;
  if (expected && legacyKey && legacyKey.length === expected.length) {
    let mismatch = 0;
    for (let i = 0; i < legacyKey.length; i++) {
      mismatch |= legacyKey.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch === 0) {
      // Resolve the first business (old behavior)
      const sb = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: biz } = await (sb as any)
        .from("businesses")
        .select("id, user_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (biz) {
        console.warn("[api-auth] Legacy INTERNAL_API_KEY used — migrate to per-business keys");
        return {
          businessId: biz.id,
          userId: biz.user_id,
          scopes: ["leads:read", "leads:write", "customers:read", "customers:write", "agent:access"] as ApiScope[],
          keyId: "legacy",
        };
      }
    }
  }

  return null;
}

// ── Scope checking ───────────────────────────────────────────────────────────

export function requireScope(scopes: ApiScope[], required: ApiScope): boolean {
  return scopes.includes(required);
}

// ── Key generation ───────────────────────────────────────────────────────────

export function generateApiKey(): { key: string; prefix: string; hashPromise: Promise<string> } {
  const bytes = new Uint8Array(16); // 16 bytes = 32 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = `inv_${hex}`;
  const prefix = hex.slice(0, 8);
  return { key, prefix, hashPromise: hashKey(key) };
}
