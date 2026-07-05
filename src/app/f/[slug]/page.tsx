import { PublicFormShell } from "@/components/forms/public-form-shell";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicFormShell slug={slug} />;
}
