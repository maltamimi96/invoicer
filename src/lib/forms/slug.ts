/** Slugify a form name for its public URL (/f/<slug>). Plain module. */
export function slugifyFormName(name: string): string {
  const base = (name || "form")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "form";
}
