// Reverse map: country name (lowercased, common variants) -> ISO 3166-1 alpha-2.
// Built from Intl.DisplayNames in the browser; here we hand-map the common ones
// + accept already-coded inputs ("AU", "GB").

const NAME_TO_CODE: Record<string, string> = {
  "australia": "au",
  "united kingdom": "gb", "uk": "gb", "great britain": "gb", "britain": "gb", "england": "gb", "scotland": "gb", "wales": "gb",
  "united states": "us", "united states of america": "us", "usa": "us", "us": "us", "america": "us",
  "new zealand": "nz",
  "canada": "ca",
  "ireland": "ie",
  "south africa": "za",
  "india": "in",
  "germany": "de", "deutschland": "de",
  "france": "fr",
  "spain": "es",
  "italy": "it",
  "netherlands": "nl", "holland": "nl",
  "belgium": "be",
  "switzerland": "ch",
  "austria": "at",
  "sweden": "se",
  "norway": "no",
  "denmark": "dk",
  "finland": "fi",
  "portugal": "pt",
  "poland": "pl",
  "japan": "jp",
  "singapore": "sg",
  "hong kong": "hk",
  "uae": "ae", "united arab emirates": "ae",
  "saudi arabia": "sa",
  "mexico": "mx",
  "brazil": "br",
};

export function toCountryCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  // already a 2-letter code
  if (/^[a-z]{2}$/.test(v)) return v;
  return NAME_TO_CODE[v] ?? null;
}
