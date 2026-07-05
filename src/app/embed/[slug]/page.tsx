import { PublicFormShell } from "@/components/forms/public-form-shell";

export const dynamic = "force-dynamic";

// Bare page meant to load inside an <iframe> on a third-party site.
export default async function EmbedFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicFormShell slug={slug} embed />;
}
