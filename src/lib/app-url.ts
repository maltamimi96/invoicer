/**
 * Resolve the public base URL for the app.
 * Order: explicit NEXT_PUBLIC_APP_URL → Vercel-provided URL → empty string.
 * Always returned without a trailing slash.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "";
}
