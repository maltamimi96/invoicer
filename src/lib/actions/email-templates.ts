"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_VARIABLES,
  EMAIL_TEMPLATE_LABELS,
  resolveEmailTemplate,
  renderTemplateVars,
  type EmailTemplateType,
  type ResolvedEmailTemplate,
} from "@/lib/emails/templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export interface EmailTemplateSummary {
  type: EmailTemplateType;
  label: string;
  customised: boolean;
  resolved: ResolvedEmailTemplate;
  defaults: Omit<ResolvedEmailTemplate, "type" | "custom_html">;
  variables: string[];
}

export async function getEmailTemplates(): Promise<EmailTemplateSummary[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: rows } = await tbl(supabase, "email_templates")
    .select("*")
    .eq("business_id", businessId);

  return EMAIL_TEMPLATE_TYPES.map((type) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (rows ?? []).find((r: any) => r.template_type === type) ?? null;
    return {
      type,
      label: EMAIL_TEMPLATE_LABELS[type],
      customised: !!row,
      resolved: resolveEmailTemplate(type, row),
      defaults: EMAIL_TEMPLATE_DEFAULTS[type],
      variables: EMAIL_TEMPLATE_VARIABLES[type],
    };
  });
}

export async function saveEmailTemplate(
  templateType: EmailTemplateType,
  fields: {
    subject?: string | null;
    greeting?: string | null;
    intro?: string | null;
    footer_note?: string | null;
    accent_color?: string | null;
    show_line_items?: boolean;
    show_payment_details?: boolean;
    show_buttons?: boolean;
    custom_html?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Empty strings reset the field to its built-in default (stored as NULL).
  const clean = Object.fromEntries(
    Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
  );

  const { error } = await tbl(supabase, "email_templates").upsert(
    { business_id: businessId, template_type: templateType, ...clean },
    { onConflict: "business_id,template_type" },
  );
  if (error) throw error;

  revalidatePath("/settings/email-templates");
}

export async function resetEmailTemplate(templateType: EmailTemplateType): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "email_templates")
    .delete()
    .eq("business_id", businessId)
    .eq("template_type", templateType);
  if (error) throw error;

  revalidatePath("/settings/email-templates");
}

/**
 * Render a live preview of a template with sample data — used by the editor's
 * preview pane so the user sees the email before saving. Accepts the unsaved
 * field values straight from the form.
 */
export async function previewEmailTemplate(
  templateType: EmailTemplateType,
  fields: {
    subject?: string | null;
    greeting?: string | null;
    intro?: string | null;
    footer_note?: string | null;
    accent_color?: string | null;
    show_line_items?: boolean;
    show_payment_details?: boolean;
    show_buttons?: boolean;
    custom_html?: string | null;
  },
): Promise<{ subject: string; html: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: business } = await tbl(supabase, "businesses")
    .select("*")
    .eq("id", businessId)
    .single();

  const template = resolveEmailTemplate(templateType, {
    subject: fields.subject ?? null,
    greeting: fields.greeting ?? null,
    intro: fields.intro ?? null,
    footer_note: fields.footer_note ?? null,
    accent_color: fields.accent_color ?? null,
    show_line_items: fields.show_line_items ?? true,
    show_payment_details: fields.show_payment_details ?? true,
    show_buttons: fields.show_buttons ?? true,
    custom_html: fields.custom_html ?? null,
  });

  const today = new Date();
  const plusDays = (d: number) => new Date(today.getTime() + d * 86_400_000).toISOString();
  const sampleCustomer = { name: "Sarah Mitchell", email: "sarah@example.com" };
  const sampleItems = [
    { id: "1", name: "Roof inspection and report", description: "Roof inspection and report", quantity: 1, unit_price: 400, tax_rate: 10, discount_percent: 0, subtotal: 400, tax_amount: 40, total: 400 },
    { id: "2", name: "Gutter cleaning", description: "Gutter cleaning", quantity: 2, unit_price: 150, tax_rate: 10, discount_percent: 0, subtotal: 300, tax_amount: 30, total: 300 },
  ];

  switch (templateType) {
    case "invoice": {
      const { invoiceEmailHtml, invoiceEmailSubject } = await import("@/lib/emails/invoice");
      const sampleInvoice = {
        number: `${business?.invoice_prefix ?? "INV"}-0042`,
        issue_date: today.toISOString(),
        due_date: plusDays(14),
        subtotal: 700, discount_amount: 0, tax_total: 70, total: 770, amount_paid: 0,
        property_address: "12 Park Lane, Bondi NSW 2026",
        notes: null, terms: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subject: invoiceEmailSubject({ invoice: sampleInvoice, customer: sampleCustomer as any, business }, template),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        html: invoiceEmailHtml({ invoice: sampleInvoice, customer: sampleCustomer as any, business, lineItems: sampleItems, portalUrl: "#", pdfUrl: "#", template }),
      };
    }
    case "quote": {
      const { quoteEmailHtml, quoteEmailSubject } = await import("@/lib/emails/quote");
      const sampleQuote = {
        number: `${business?.quote_prefix ?? "Q"}-0042`,
        issue_date: today.toISOString(),
        expiry_date: plusDays(30),
        subtotal: 700, discount_amount: 0, tax_total: 70, total: 770,
        property_address: "12 Park Lane, Bondi NSW 2026",
        notes: null, terms: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subject: quoteEmailSubject({ quote: sampleQuote, customer: sampleCustomer as any, business }, template),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        html: quoteEmailHtml({ quote: sampleQuote, customer: sampleCustomer as any, business, lineItems: sampleItems, acceptUrl: "#", pdfUrl: "#", template }),
      };
    }
    case "team_invite": {
      const { teamInviteEmailHtml, teamInviteEmailSubject } = await import("@/lib/emails/team-invite");
      const args = { businessName: business?.name ?? "Your business", inviterName: "You", role: "worker", inviteCode: "ABCD2345" };
      return {
        subject: teamInviteEmailSubject(args, template),
        html: teamInviteEmailHtml({ ...args, inviteUrl: "#", template }),
      };
    }
    case "work_order_submitted": {
      const { workOrderSubmittedEmailHtml, workOrderSubmittedEmailSubject } = await import("@/lib/emails/work-order-submitted");
      const args = {
        businessName: business?.name ?? "Your business",
        workerName: "Alex Smith", workerEmail: "alex@example.com",
        title: "Cafe roof gutter clean",
        propertyAddress: "88 King Street, Newtown NSW 2042",
      };
      return {
        subject: workOrderSubmittedEmailSubject(args, template),
        html: workOrderSubmittedEmailHtml({ ...args, workerNotes: "Job done — before/after photos uploaded.", viewUrl: "#", template }),
      };
    }
    case "payment_receipt": {
      const { paymentReceiptEmailHtml, paymentReceiptEmailSubject } = await import("@/lib/emails/payment-receipt");
      const sampleInvoice = {
        number: `${business?.invoice_prefix ?? "INV"}-0042`,
        total: 770, amount_paid: 770,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const args = {
        invoice: sampleInvoice,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customer: sampleCustomer as any,
        business,
        amount: 770,
        paymentDate: today.toISOString(),
        paymentMethod: "Stripe (card)",
      };
      return {
        subject: paymentReceiptEmailSubject(args, template),
        html: paymentReceiptEmailHtml({ ...args, portalUrl: "#", template }),
      };
    }
    default: {
      // Exhaustive guard — render vars over the subject as a fallback.
      const subject = renderTemplateVars(template.subject, { business_name: business?.name ?? "" });
      return { subject, html: `<p>${subject}</p>` };
    }
  }
}
