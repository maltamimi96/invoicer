import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { toCountryCode } from "@/lib/country-codes";

// Proxy to OpenStreetMap Nominatim. Free, no API key.
// Biases results to the active business's country.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 3) return NextResponse.json([]);

  // Resolve country bias: explicit query param wins, else active business's country.
  let countryCode = toCountryCode(req.nextUrl.searchParams.get("country"));
  if (!countryCode) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const businessId = await getActiveBizId(supabase, user.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: biz } = await (supabase as any)
          .from("businesses")
          .select("country")
          .eq("id", businessId)
          .maybeSingle();
        countryCode = toCountryCode(biz?.country);
      }
    } catch { /* ignore — fall back to global */ }
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  if (countryCode) url.searchParams.set("countrycodes", countryCode);

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
