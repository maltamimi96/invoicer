/**
 * Prospect sourcing — the port of the standalone agent's prospector.js.
 *
 * Google Places Text Search finds businesses matching the configured queries
 * inside the configured locations; each result becomes a prospect. Places does
 * NOT return email addresses, so a sourced prospect usually arrives with a
 * website and no email — which is what the (separate, opt-in) crawler is for.
 *
 * Compliance, and why the crawler is gated:
 *   Australia's Spam Act 2003 s.22 prohibits sending to addresses collected by
 *   address-harvesting software. Pulling a business's own published contact
 *   address is a different thing from harvesting, but the line is thin enough
 *   that it must be a deliberate, attributable choice — hence crawler_enabled
 *   defaults false and records who turned it on (see acknowledgeCrawlerCompliance).
 *
 * Each business supplies its OWN Places key, stored encrypted. We never ship a
 * shared key: quota and billing belong to whoever is doing the sourcing.
 */
import { decryptSecret } from "@/lib/crypto";
import type { OutreachLocation } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface SourcedBusiness {
  name: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  place_id: string;
}

interface PlacesResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
}

/** One Places Text Search page (max 20 results). */
async function placesSearch(
  apiKey: string, query: string, loc: OutreachLocation,
): Promise<SourcedBusiness[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber",
    },
    body: JSON.stringify({
      textQuery: `${query} ${loc.label}`.trim(),
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: loc.lat, longitude: loc.lng },
          radius: Math.min(50000, Math.max(1, loc.radius_m || 25000)),
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Places search failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { places?: PlacesResult[] };
  return (json.places ?? [])
    .filter((p) => p.id && p.displayName?.text)
    .map((p) => ({
      place_id: p.id!,
      name: p.displayName!.text!,
      address: p.formattedAddress ?? null,
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
    }));
}

/** Strip a URL back to its origin so one site yields one crawl target. */
function origin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

export interface SourcingResult {
  found: number; created: number; skipped: number; errors: string[];
}

/**
 * Run one sourcing pass for a business: every query × every location, capped
 * by the daily quota. Dedupes against existing prospects by place_id (stored
 * in custom_fields) and by website origin.
 */
export async function sourceProspects(
  sb: SB, businessId: string, opts: { limit?: number } = {},
): Promise<SourcingResult> {
  const out: SourcingResult = { found: 0, created: 0, skipped: 0, errors: [] };

  const { data: settings } = await sb.from("outreach_settings").select("*")
    .eq("business_id", businessId).maybeSingle();
  if (!settings?.sourcing_enabled) return out;
  if (!settings.places_api_key_enc) {
    out.errors.push("No Google Places API key configured");
    return out;
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.places_api_key_enc);
  } catch {
    out.errors.push("Couldn't decrypt the Places API key — is APP_ENCRYPTION_KEY set?");
    return out;
  }

  const queries: string[] = settings.sourcing_queries ?? [];
  const locations: OutreachLocation[] = settings.sourcing_locations ?? [];
  if (!queries.length || !locations.length) return out;

  const quota = Math.max(0, opts.limit ?? settings.sourcing_daily_quota ?? 10);
  if (quota === 0) return out;

  // Existing prospects, so a repeat run doesn't re-add the same businesses.
  const { data: existing } = await sb.from("prospects")
    .select("website, custom_fields").eq("business_id", businessId).limit(10000);
  const seenPlace = new Set<string>();
  const seenSite = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((existing ?? []) as any[])) {
    const pid = (p.custom_fields ?? {}).place_id;
    if (pid) seenPlace.add(String(pid));
    if (p.website) { const o = origin(p.website); if (o) seenSite.add(o); }
  }

  const rows: Record<string, unknown>[] = [];

  outer:
  for (const query of queries) {
    for (const loc of locations) {
      let batch: SourcedBusiness[];
      try {
        batch = await placesSearch(apiKey, query, loc);
      } catch (e) {
        out.errors.push(e instanceof Error ? e.message : "Places search failed");
        continue;
      }
      out.found += batch.length;

      for (const b of batch) {
        if (rows.length >= quota) break outer;
        const site = b.website ? origin(b.website) : null;
        if (seenPlace.has(b.place_id) || (site && seenSite.has(site))) { out.skipped++; continue; }
        seenPlace.add(b.place_id);
        if (site) seenSite.add(site);

        rows.push({
          business_id: businessId,
          company: b.name,
          name: null,
          email: null,                       // Places never returns one
          phone: b.phone,
          website: b.website,
          source: "places",
          status: "new",
          tags: [query],
          notes: b.address ? `Sourced from Google Places · ${b.address}` : "Sourced from Google Places",
          custom_fields: { place_id: b.place_id, sourced_query: query, sourced_location: loc.label },
        });
      }
    }
  }

  if (!rows.length) return out;
  const { error } = await sb.from("prospects").insert(rows);
  if (error) { out.errors.push(error.message); return out; }
  out.created = rows.length;
  return out;
}
