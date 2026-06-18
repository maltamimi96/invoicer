/**
 * Per-business email template system.
 *
 * Every outbound email type has a built-in default (subject, greeting, intro,
 * footer, accent colour). A business can override any subset via the
 * `email_templates` table — NULL fields fall through to the default, so a
 * partial override works and deleting the row is a full reset.
 *
 * All text fields support `{{variable}}` placeholders. The variables available
 * per type are documented in EMAIL_TEMPLATE_VARIABLES (also surfaced in the
 * Settings editor and the MCP tools).
 */

export type EmailTemplateType =
  | "invoice"
  | "quote"
  | "team_invite"
  | "work_order_submitted"
  | "payment_receipt";

export const EMAIL_TEMPLATE_TYPES: EmailTemplateType[] = [
  "invoice",
  "quote",
  "team_invite",
  "work_order_submitted",
  "payment_receipt",
];

export interface EmailTemplateOverride {
  subject: string | null;
  greeting: string | null;
  intro: string | null;
  footer_note: string | null;
  accent_color: string | null;
  show_line_items: boolean;
  show_payment_details: boolean;
  show_buttons: boolean;
  custom_html: string | null;
}

export interface ResolvedEmailTemplate {
  type: EmailTemplateType;
  subject: string;
  greeting: string;
  intro: string;
  /** Extra free-text paragraph rendered near the bottom of the email. */
  footer_note: string;
  accent_color: string;
  show_line_items: boolean;
  show_payment_details: boolean;
  show_buttons: boolean;
  custom_html: string | null;
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<
  EmailTemplateType,
  Omit<ResolvedEmailTemplate, "type" | "custom_html">
> = {
  invoice: {
    subject: "Invoice {{invoice_number}} from {{business_name}}",
    greeting: "Hi {{customer_name}},",
    intro:
      "Please find your invoice from <strong>{{business_name}}</strong> attached to this email.",
    footer_note: "",
    accent_color: "#3b82f6",
    show_line_items: true,
    show_payment_details: true,
    show_buttons: true,
  },
  quote: {
    subject: "Quote {{quote_number}} from {{business_name}}",
    greeting: "Hi {{customer_name}},",
    intro:
      "Please find your quote from <strong>{{business_name}}</strong> below.",
    footer_note: "",
    accent_color: "#8b5cf6",
    show_line_items: true,
    show_payment_details: true,
    show_buttons: true,
  },
  team_invite: {
    subject: "You've been invited to {{business_name}}",
    greeting: "",
    intro:
      "<strong>{{inviter_name}}</strong> has invited you to join <strong>{{business_name}}</strong> on Kirei as a <strong>{{role}}</strong>.",
    footer_note: "",
    accent_color: "#3b82f6",
    show_line_items: true,
    show_payment_details: true,
    show_buttons: true,
  },
  work_order_submitted: {
    subject: "Work order submitted — {{job_title}}",
    greeting: "",
    intro: "A work order has been submitted and is ready for review.",
    footer_note: "",
    accent_color: "#10b981",
    show_line_items: true,
    show_payment_details: true,
    show_buttons: true,
  },
  payment_receipt: {
    subject: "Payment received — invoice {{invoice_number}}",
    greeting: "Hi {{customer_name}},",
    intro:
      "Thanks — we've received your payment of <strong>{{amount}}</strong>. Here's your receipt.",
    footer_note: "",
    accent_color: "#10b981",
    show_line_items: false,
    show_payment_details: false,
    show_buttons: true,
  },
};

/** Variables each template type can interpolate, for editor UI + MCP docs. */
export const EMAIL_TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  invoice: [
    "customer_name", "business_name", "invoice_number", "total", "balance_due",
    "amount_paid", "issue_date", "due_date", "property_address",
    "business_email", "business_phone",
  ],
  quote: [
    "customer_name", "business_name", "quote_number", "total", "issue_date",
    "expiry_date", "property_address", "business_email", "business_phone",
  ],
  team_invite: ["business_name", "inviter_name", "role", "invite_code"],
  work_order_submitted: [
    "business_name", "job_title", "worker_name", "worker_email",
    "property_address",
  ],
  payment_receipt: [
    "customer_name", "business_name", "invoice_number", "amount",
    "amount_paid", "balance_due", "total", "payment_date", "payment_method",
    "business_email", "business_phone",
  ],
};

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  invoice: "Invoice email",
  quote: "Quote email",
  team_invite: "Team invite email",
  work_order_submitted: "Work order submitted email",
  payment_receipt: "Payment receipt email",
};

/** Replace {{key}} placeholders. Unknown keys render as empty string. */
export function renderTemplateVars(
  text: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key.toLowerCase()];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Merge a DB override row (or null) onto the built-in defaults. */
export function resolveEmailTemplate(
  type: EmailTemplateType,
  row: Partial<EmailTemplateOverride> | null | undefined,
): ResolvedEmailTemplate {
  const d = EMAIL_TEMPLATE_DEFAULTS[type];
  return {
    type,
    subject: row?.subject?.trim() ? row.subject : d.subject,
    greeting: row?.greeting ?? d.greeting,
    intro: row?.intro ?? d.intro,
    footer_note: row?.footer_note ?? d.footer_note,
    accent_color: row?.accent_color?.trim() ? row.accent_color : d.accent_color,
    show_line_items: row?.show_line_items ?? d.show_line_items,
    show_payment_details: row?.show_payment_details ?? d.show_payment_details,
    show_buttons: row?.show_buttons ?? d.show_buttons,
    custom_html: row?.custom_html?.trim() ? row.custom_html : null,
  };
}

/**
 * Fetch + resolve a business's template for one type. Works with any Supabase
 * client (cookie-bound server client or admin client) — callers that already
 * hold an admin client scoped by business (MCP, cron) pass it straight in.
 */
export async function getResolvedEmailTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  businessId: string,
  type: EmailTemplateType,
): Promise<ResolvedEmailTemplate> {
  try {
    const { data } = await supabase
      .from("email_templates")
      .select("subject, greeting, intro, footer_note, accent_color, show_line_items, show_payment_details, show_buttons, custom_html")
      .eq("business_id", businessId)
      .eq("template_type", type)
      .maybeSingle();
    return resolveEmailTemplate(type, data);
  } catch {
    // Template lookup must never block a send — fall back to defaults.
    return resolveEmailTemplate(type, null);
  }
}
