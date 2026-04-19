import { NextRequest, NextResponse } from "next/server";

// Proxy to OpenStreetMap Nominatim. Free, no API key.
// User-Agent header required by Nominatim usage policy.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 3) return NextResponse.json([]);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Invoicer (admin@invoicer.app)" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const raw = await res.json();
    type NominatimAddress = {
      house_number?: string; road?: string; suburb?: string; neighbourhood?: string;
      city?: string; town?: string; village?: string; state?: string;
      postcode?: string; country?: string; country_code?: string;
    };
    type NominatimResult = { display_name: string; lat: string; lon: string; address: NominatimAddress };
    const results = (raw as NominatimResult[]).map((r) => {
      const a = r.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(" ");
      const city = a.city || a.town || a.village || a.suburb || a.neighbourhood || "";
      return {
        label: r.display_name,
        address: street || a.road || "",
        city,
        postcode: a.postcode || "",
        country: a.country || "",
        lat: r.lat,
        lon: r.lon,
      };
    });
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
