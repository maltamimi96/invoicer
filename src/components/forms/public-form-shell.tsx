import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicFormFill } from "@/components/forms/public-form-fill";
import type { OnboardingField, PublicFormSettings, PublicFormTheme } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Shared render for the hosted (/f) and embedded (/embed) public form pages. */
export async function PublicFormShell({ slug, embed }: { slug: string; embed?: boolean }) {
  const sb = createAdminClient();
  const { data: form } = await tbl(sb, "public_forms")
    .select("id, business_id, name, description, status, schema, settings, theme").eq("slug", slug).maybeSingle();
  if (!form || form.status !== "published") notFound();

  const { data: business } = await tbl(sb, "businesses").select("name, logo_url").eq("id", form.business_id).maybeSingle();

  const schema = (form.schema ?? []) as OnboardingField[];
  const settings = (form.settings ?? {}) as PublicFormSettings;
  const theme = (form.theme ?? {}) as PublicFormTheme;
  const showBranding = theme.show_branding !== false;

  const body = (
    <div className={embed ? "px-4 py-6" : "max-w-2xl mx-auto px-6 py-10"}>
      {!embed && (business?.logo_url || business?.name) && (
        <div className="flex items-center gap-3 mb-6">
          {business?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={business.logo_url} alt={business.name} className="w-11 h-11 rounded-lg object-contain bg-white border border-border p-1" />
          ) : null}
          <span className="font-semibold">{business?.name}</span>
        </div>
      )}
      <h1 className="text-2xl font-bold">{form.name}</h1>
      {form.description && <p className="text-sm text-muted-foreground mt-1 mb-5">{form.description}</p>}
      <div className={form.description ? "" : "mt-5"}>
        <PublicFormFill
          slug={slug}
          fields={schema}
          submitText={settings.submit_text || "Submit"}
          thankYouMessage={settings.thank_you_message ?? null}
          accent={theme.accent}
        />
      </div>
      {showBranding && (
        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by <a href="https://kireihq.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Kirei</a>
        </p>
      )}
    </div>
  );

  if (embed) return <div className="min-h-screen bg-background">{body}</div>;
  return <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">{body}</div>;
}
