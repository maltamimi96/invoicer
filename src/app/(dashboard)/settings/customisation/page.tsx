import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { getPluginFlags } from "@/lib/layout-data";
import { resolveEnabledPlugins } from "@/lib/plugins/registry";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Palette, Users, FileText, ClipboardList, ListChecks, Wrench,
  CalendarDays, Columns3, Zap, Mail,
} from "@/components/ui/icons";

/**
 * Everything that can be tailored, in one place.
 *
 * These editors were built one at a time and each landed wherever its feature
 * lived — email templates under Settings, client fields under Settings,
 * onboarding forms at a top-level route, document templates somewhere else
 * again. Nothing was missing; it was just unfindable. This is a directory, not
 * a new system: every card links to the editor that already exists.
 *
 * `plugin` gates a card on the module being enabled, so this page never offers
 * a link that redirects home.
 */

interface Item {
  href: string;
  label: string;
  hint: string;
  icon: typeof Palette;
  /** Only show when this plugin is enabled. */
  plugin?: string;
}

const GROUPS: Array<{ title: string; blurb: string; items: Item[] }> = [
  {
    title: "Look and feel",
    blurb: "How Kirei looks, and what things are called.",
    items: [
      { href: "/settings?tab=appearance", label: "Theme", hint: "Midnight, Daylight, Azure, Orchid or Studio — applies everywhere.", icon: Palette },
      { href: "/settings/navigation", label: "Navigation", hint: "Rename, reorder and hide the items in your sidebar.", icon: Columns3 },
    ],
  },
  {
    title: "What you record",
    blurb: "The fields and categories your own data uses.",
    items: [
      { href: "/settings/client-fields", label: "Client fields", hint: "What you keep about a client beyond their contact details.", icon: Users },
    ],
  },
  {
    title: "What you send",
    blurb: "Documents and messages that leave the building.",
    items: [
      { href: "/settings/email-templates", label: "Email templates", hint: "Wording, logo and sections for every email Kirei sends.", icon: Mail },
      { href: "/settings/document-templates", label: "Document templates", hint: "Invoice and quote PDFs — layout, terms and defaults.", icon: FileText },
      { href: "/contracts", label: "Contract templates", hint: "Reusable contract bodies with merge fields.", icon: FileText, plugin: "contracts" },
    ],
  },
  {
    title: "Forms",
    blurb: "What you ask clients and leads to fill in.",
    items: [
      { href: "/onboarding-forms", label: "Onboarding forms", hint: "Sent to a client to collect details, files and credentials.", icon: ClipboardList, plugin: "client-onboarding" },
      { href: "/forms", label: "Public forms", hint: "Embeddable lead-capture forms for your website.", icon: ListChecks, plugin: "form-builder" },
    ],
  },
  {
    title: "How work runs",
    blurb: "Templates and rules for the day-to-day.",
    items: [
      { href: "/settings/work-order-templates", label: "Job templates", hint: "Starting points that prefill a new job.", icon: Wrench },
      { href: "/settings/booking", label: "Booking", hint: "Appointment types, working hours and exceptions.", icon: CalendarDays, plugin: "bookings" },
      { href: "/automations", label: "Automations", hint: "When something happens, do something.", icon: Zap, plugin: "automations" },
    ],
  },
];

export default async function CustomisationPage() {
  const supabase = await createClient();
  const user = await getUser().catch(() => null);
  if (!user) redirect("/auth/login");
  const businessId = await getActiveBizId(supabase, user.id);

  const flags = await getPluginFlags(businessId);
  const plugins = resolveEnabledPlugins(flags.installRows, {
    quoting_agent_settings: flags.quoting,
    onboarding_settings: flags.onboarding,
    form_builder_settings: flags.formBuilder,
  });

  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.plugin || plugins[i.plugin]) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customisation"
        subtitle="Everything you can tailor, grouped by what it changes."
      />

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{group.title}</h2>
            <p className="text-sm text-muted-foreground">{group.blurb}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="h-full transition-colors hover:border-border-strong">
                  <CardContent className="flex gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft">
                      <item.icon className="h-[18px] w-[18px] text-primary" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
