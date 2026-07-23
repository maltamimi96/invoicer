import { getDocumentTemplates } from "@/lib/actions/document-templates";
import { DocumentTemplatesClient } from "@/components/settings/document-templates-client";

export const metadata = { title: "Document Templates" };

export default async function DocumentTemplatesPage() {
  const templates = await getDocumentTemplates();
  return <DocumentTemplatesClient initialTemplates={templates} />;
}
