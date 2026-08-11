/**
 * Finding businesses in an area, via Google Places.
 *
 * Places rather than web search, for one decisive reason: it returns a
 * `websiteUri` field. "Has no website" is then a FACT from the source, not a
 * model's inference from failing to find one — and that is exactly the sort of
 * criterion this feature exists to hunt on. It also takes a circle natively,
 * so "within 25km of Parramatta" is one request rather than a guess.
 *
 * What it will never give you is an email address. Prospects arrive with a
 * phone and an address; email is the outreach system's problem.
 *
 * Plain module — no session. The runner and the cron both use it.
 */

export interface PlaceHit {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  lat: number | null;
  lng: number | null;
  raw: Record<string, unknown>;
}

/**
 * The fields to ask for. Places bills by field mask, so asking for everything
 * costs materially more per call — this is the minimum that supports the
 * filters and the review screen.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.location",
].join(",");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHit(p: any): PlaceHit {
  return {
    place_id: String(p.id),
    name: p.displayName?.text ?? "Unnamed",
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    category: p.primaryTypeDisplayName?.text ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    review_count: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    raw: p,
  };
}

export interface SearchArea {
  lat: number;
  lng: number;
  radiusM: number;
}

/**
 * The bounding box around a circle.
 *
 * Text Search's `locationRestriction` accepts a RECTANGLE only — passing a
 * circle is a 400 ("Unknown name \"circle\""), even though `locationBias`
 * takes one. So the hard restriction has to be a box, and the box is ~27%
 * larger than the circle it contains: its corners reach `radius * √2`.
 * `withinRadius` below trims that back off.
 */
export function boundingBox(area: SearchArea) {
  const r = Math.min(Math.max(area.radiusM, 1), 50_000);
  const dLat = (r / 111_320);
  // Longitude degrees shrink towards the poles. The floor stops the box
  // exploding to the whole planet for a point near one.
  const dLng = r / (111_320 * Math.max(Math.cos((area.lat * Math.PI) / 180), 0.01));
  return {
    low: {
      latitude: Math.max(-90, area.lat - dLat),
      longitude: Math.max(-180, area.lng - dLng),
    },
    high: {
      latitude: Math.min(90, area.lat + dLat),
      longitude: Math.min(180, area.lng + dLng),
    },
  };
}

/** Great-circle distance in metres. */
export function distanceM(
  a: { lat: number; lng: number }, b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Is this result actually inside the radius the user asked for?
 *
 * The box has corners the circle doesn't, so without this a "10km" hunt
 * returns businesses up to 14km away. A result with no coordinates is kept —
 * dropping a real business over a missing field would be the worse error.
 */
export function withinRadius(hit: PlaceHit, area: SearchArea): boolean {
  if (hit.lat == null || hit.lng == null) return true;
  return distanceM({ lat: area.lat, lng: area.lng }, { lat: hit.lat, lng: hit.lng })
    <= Math.min(Math.max(area.radiusM, 1), 50_000);
}

/**
 * One text query, confined to an area.
 *
 * `locationRestriction` rather than `locationBias`: a bias is a suggestion and
 * Places will happily return results from the next state if it likes them
 * better. A hunt with a 10km radius means 10km — enforced in two steps, since
 * the restriction can only be a rectangle: the box goes to Google, and
 * `withinRadius` trims the corners off the results here.
 *
 * Paginated to `maxPages` because Places returns 20 per page and a broad query
 * in a city can run to hundreds — each page is a billed request, and the run
 * has a budget.
 */
export async function searchPlaces(
  apiKey: string,
  query: string,
  area: SearchArea,
  maxPages = 3,
): Promise<{ hits: PlaceHit[]; error: string | null; requests: number }> {
  const hits: PlaceHit[] = [];
  let requests = 0;
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      textQuery: query,
      // Rectangle, not circle — see boundingBox(). Places also caps the
      // radius at 50km, which boundingBox() clamps to.
      locationRestriction: { rectangle: boundingBox(area) },
      maxResultCount: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    let res: Response;
    // Counted before the await: Google bills the request, not the response, so
    // a call that times out still cost money. Under-counting here would let a
    // flaky run slip past the budget.
    requests++;
    try {
      res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": `${FIELD_MASK},nextPageToken`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { hits, requests, error: e instanceof Error ? e.message : "Places request failed" };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Surface Google's own message — "API key not valid" and "billing not
      // enabled" are the two everyone hits, and both are actionable.
      return { hits, requests, error: `Places ${res.status}: ${text.slice(0, 300)}` };
    }

    const json = await res.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (json.places ?? []) as any[]) {
      const hit = toHit(p);
      // Trim the box back to the circle the user actually asked for.
      if (withinRadius(hit, area)) hits.push(hit);
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return { hits, requests, error: null };
}

/** Turn a place name into coordinates, so a hunt can be defined by suburb. */
export async function geocodeArea(
  apiKey: string, label: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: label, maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const loc = json.places?.[0]?.location;
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  } catch {
    return null;
  }
}
