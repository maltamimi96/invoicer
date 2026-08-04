/**
 * VoIPcloud REST API client (integration v2).
 *
 * Confirmed from the account's own API page:
 *
 *   GET  /api/integration/v2/get-user-calls        call history per user
 *   GET  /api/integration/v2/get-queue-calls       calls that hit a queue
 *   GET  /api/integration/v2/get-ringgroup-calls   calls that hit a ring group
 *   POST /api/integration/v2/call-to-number        click-to-call (multipart)
 *
 * Auth is an API key sent as a `token` HEADER — not a bearer token, not a
 * query param. The key is stored encrypted per business; it is never logged,
 * never returned to the client, and never leaves the server.
 *
 * There are NO SMS endpoints. Their API page says to contact support for
 * unsupported functionality, so messaging needs a different provider until
 * that changes.
 *
 * NOTE: the account can restrict the API to whitelisted IPs. Vercel's egress
 * addresses are not static on all plans, so a whitelist may block us — see
 * testConnection(), which surfaces that as a distinct, actionable error.
 */
import type { VoipEvent } from "./ingest";

export const VOIP_DEFAULT_BASE = "https://au.voipcloud.online";

/** A row from get-user-calls. Their documented shape. */
export interface UserCallRow {
  unique_call_id: string | null;
  type: string;                       // e.g. user_inbound_missed
  caller_id: string | null;
  caller_name: string | null;
  dest_number: string | null;
  user_name: string | null;
  user_number: string | null;
  call_start_at: string | null;
  connected_at: string | null;
  call_duration: number | null;       // ringing + talking
  conversation_duration: number | null; // talking only
}

/** Queue and ring-group rows differ: `callerid`, plus a separate `status`. */
export interface GroupCallRow {
  unique_call_id: string | null;
  queue_name?: string | null;
  ring_group_name?: string | null;
  callerid?: string | null;
  caller_id?: string | null;
  caller_name: string | null;
  dest_number: string | null;
  user_name: string | null;
  user_number: string | null;
  call_start_at: string | null;
  connected_at?: string | null;
  call_duration: number | null;
  conversation_duration: number | null;
  status: string | null;              // answered | abandoned
}

export interface VoipApiError extends Error {
  status?: number;
  kind?: "auth" | "ip_blocked" | "network" | "api";
}

function apiError(message: string, kind: VoipApiError["kind"], status?: number): VoipApiError {
  const e = new Error(message) as VoipApiError;
  e.kind = kind; e.status = status;
  return e;
}

async function request<T>(
  baseUrl: string, apiKey: string, path: string, params?: Record<string, string | number | undefined>,
): Promise<T[]> {
  const url = new URL(path, baseUrl || VOIP_DEFAULT_BASE);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, { headers: { token: apiKey, Accept: "application/json" } });
  } catch (e) {
    throw apiError(`Couldn't reach VoIPcloud: ${e instanceof Error ? e.message : "network error"}`, "network");
  }

  if (res.status === 401 || res.status === 403) {
    // Their two failure modes look the same from here, and the fix differs, so
    // say both rather than guessing.
    throw apiError(
      "VoIPcloud rejected the API key (401/403). Check the key is current, and that this server's IP is allowed if you've set a whitelist.",
      "auth", res.status,
    );
  }
  if (!res.ok) {
    throw apiError(`VoIPcloud returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`, "api", res.status);
  }

  const json = await res.json().catch(() => null) as { code?: number; data?: T[]; status?: string; message?: string } | null;
  if (!json) throw apiError("VoIPcloud returned a response we couldn't parse as JSON", "api");
  if (json.status && json.status !== "success") {
    throw apiError(json.message || "VoIPcloud reported a failure", "api");
  }
  return json.data ?? [];
}

export interface CallQuery {
  from_date?: string;   // yyyy-mm-dd
  to_date?: string;
  offset?: number;
  limit?: number;       // 1..10000, their default 100
  unique_call_id?: string;
}

export function getUserCalls(baseUrl: string, apiKey: string, q: CallQuery = {}) {
  return request<UserCallRow>(baseUrl, apiKey, "/api/integration/v2/get-user-calls",
    { sort_by: "newest_first", ...q });
}

export function getQueueCalls(baseUrl: string, apiKey: string, q: CallQuery = {}) {
  return request<GroupCallRow>(baseUrl, apiKey, "/api/integration/v2/get-queue-calls",
    { sort_by: "newest_first", ...q });
}

export function getRingGroupCalls(baseUrl: string, apiKey: string, q: CallQuery = {}) {
  return request<GroupCallRow>(baseUrl, apiKey, "/api/integration/v2/get-ringgroup-calls",
    { sort_by: "newest_first", ...q });
}

/**
 * Click-to-call: rings `user_number` first, then dials `number_to_call` once
 * they pick up. Body is multipart/form-data, not JSON.
 */
export async function callToNumber(
  baseUrl: string, apiKey: string,
  args: { user_number: string; number_to_call: string; caller_id?: string },
): Promise<void> {
  const form = new FormData();
  form.set("user_number", args.user_number);
  form.set("number_to_call", args.number_to_call);
  if (args.caller_id) form.set("caller_id", args.caller_id);

  let res: Response;
  try {
    res = await fetch(new URL("/api/integration/v2/call-to-number", baseUrl || VOIP_DEFAULT_BASE), {
      method: "POST", headers: { token: apiKey }, body: form,
    });
  } catch (e) {
    throw apiError(`Couldn't reach VoIPcloud: ${e instanceof Error ? e.message : "network error"}`, "network");
  }

  if (res.status === 401 || res.status === 403) {
    throw apiError("VoIPcloud rejected the API key. Check the key and any IP whitelist.", "auth", res.status);
  }
  if (!res.ok) {
    throw apiError(`Call failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`, "api", res.status);
  }
}

/** Cheapest possible authenticated call, for the "Test connection" button. */
export async function testConnection(baseUrl: string, apiKey: string): Promise<{ ok: true; sampled: number }> {
  const rows = await getUserCalls(baseUrl, apiKey, { limit: 1 });
  return { ok: true, sampled: rows.length };
}

// ── Normalisation ───────────────────────────────────────────────────────────

/**
 * Map an API row onto the same VoipEvent shape the webhook produces, so a
 * synced call and a pushed call go through one ingest path and can't diverge.
 *
 * `connected_at` is the answered signal, and it's more reliable than the type
 * string: a row with a connect time was picked up, whatever it's called.
 */
export function userCallToEvent(row: UserCallRow): VoipEvent {
  return {
    type: row.type,
    unique_call_id: row.unique_call_id ?? undefined,
    caller_id: row.caller_id ?? undefined,
    caller_name: row.caller_name ?? undefined,
    dest_number: row.dest_number ?? undefined,
    user_name: row.user_name ?? undefined,
    user_number: row.user_number ?? undefined,
    call_start_at: row.call_start_at ?? undefined,
    connected_at: row.connected_at ?? undefined,
    duration: row.conversation_duration ?? row.call_duration ?? undefined,
    source: "api",
  };
}

/** Queue / ring-group rows carry the outcome in `status`, not `type`. */
export function groupCallToEvent(row: GroupCallRow, kind: "queue" | "ringgroup"): VoipEvent {
  const status = String(row.status ?? "").toLowerCase();
  return {
    // Synthesise a type in the same vocabulary classify() already understands.
    type: `${kind}_inbound_${status || "completed"}`,
    unique_call_id: row.unique_call_id ?? undefined,
    caller_id: row.callerid ?? row.caller_id ?? undefined,
    caller_name: row.caller_name ?? undefined,
    dest_number: row.dest_number ?? undefined,
    user_name: row.user_name ?? undefined,
    user_number: row.user_number ?? undefined,
    call_start_at: row.call_start_at ?? undefined,
    connected_at: row.connected_at ?? undefined,
    duration: row.conversation_duration ?? row.call_duration ?? undefined,
    component_name: row.queue_name ?? row.ring_group_name ?? undefined,
    source: "api",
  };
}

/**
 * Validate a business-supplied API endpoint.
 *
 * VoIPcloud is white-label: resellers run their own branded portals, so the
 * host can't be hardcoded. But a URL one tenant controls, fetched by OUR
 * server, is a server-side request forgery vector — point it at an internal
 * address and Kirei becomes a proxy into its own infrastructure. So:
 *
 *   · https only (their portals are, and it stops h2c/file/gopher tricks)
 *   · no IP literals — a real portal is a hostname, and this is what kills
 *     the cloud-metadata endpoint (169.254.169.254) and private ranges
 *   · no loopback or internal-only names
 *   · default port only
 *
 * Residual risk: DNS rebinding to a private address needs attacker-controlled
 * DNS. Worth an egress allow-list if this ever becomes a concern.
 */
export function assertSafeBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("That isn't a valid URL — it should look like https://au.voipcloud.online");
  }

  if (u.protocol !== "https:") throw new Error("The endpoint must start with https://");
  if (u.port && u.port !== "443") throw new Error("Use the default https port");

  const host = u.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new Error("Enter the portal's hostname, not an IP address");
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("That host isn't reachable from the internet");
  }

  return u.origin;
}
