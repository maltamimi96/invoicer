/** Iframe embed snippet for a published public form. Plain module. */
export function embedSnippet(baseUrl: string, slug: string): string {
  const src = `${baseUrl}/embed/${slug}`;
  return `<iframe src="${src}" title="Form" width="100%" height="700" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}
