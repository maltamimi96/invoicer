export interface PdfSettings {
  invoice_template: "classic" | "minimal" | "modern";
  quote_template: "pro" | "classic";
  logo_size: number;            // px width, e.g. 60 | 90 | 120
  primary_color: string;        // hex, e.g. "#2563eb"
  invoice_title: string;        // "INVOICE" | "TAX INVOICE"
  label_bank: string;           // "Bank"
  label_account_name: string;   // "Name"
  label_account_number: string; // "Account"
  label_bsb: string;            // "BSB" | "Sort code" | "Routing"
  label_tax: string;            // "GST" | "VAT" | "Tax"
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  invoice_template: "classic",
  quote_template: "pro",
  logo_size: 72,
  primary_color: "#2563eb",
  invoice_title: "INVOICE",
  label_bank: "Bank",
  label_account_name: "Name",
  label_account_number: "Account",
  label_bsb: "BSB",
  label_tax: "GST",
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Simplified types that avoid circular references with Supabase generics

export interface Business {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  tax_number: string | null;
  logo_url: string | null;
  currency: string;
  locale: string;
  accent_color: string;
  bg_pattern: string;
  sidebar_theme: string;
  invoice_prefix: string;
  invoice_next_number: number;
  quote_prefix: string;
  quote_next_number: number;
  pdf_settings: PdfSettings | null;
  payment_terms: string | null;
  default_notes: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_sort_code: string | null;
  bank_iban: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  company: string | null;
  tax_number: string | null;
  notes: string | null;
  account_type: 'individual' | 'property_mgmt' | 'commercial' | 'strata' | 'other';
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// Semantic alias — `Customer` is the row backing an Account.
export type Account = Customer;

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  unit_price: number;
  tax_rate: number;
  unit: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "partial";
  customer_id: string | null;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  subtotal: number;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
  discount_amount: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  user_id: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  customer_id: string | null;
  issue_date: string;
  expiry_date: string;
  line_items: LineItem[];
  subtotal: number;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
  discount_amount: number;
  tax_total: number;
  total: number;
  notes: string | null;
  terms: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  user_id: string;
  amount: number;
  date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface LineItem {
  id: string;
  product_id?: string;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  subtotal: number;
  tax_amount: number;
  total: number;
}

export type InvoiceWithCustomer = Invoice & { customers: Pick<Customer, "id" | "name" | "email" | "company"> | null };
export type QuoteWithCustomer = Quote & { customers: Pick<Customer, "id" | "name" | "email" | "company"> | null };

// ----------------------------------------------------------------
// REPORTS
// ----------------------------------------------------------------

export type ReportStatus = "draft" | "complete";
export type RiskRating = "Low" | "Medium" | "High" | "Critical";

export interface RiskItem {
  defect: string;
  likelihood: string;
  consequence: string;
  rating: RiskRating;
}

export interface ReportPhoto {
  id: string;
  url: string;
  storagePath: string;
  caption: string;
  order: number;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
}

export interface ReportMeta {
  advisory_banner: string;
  roof_type: string;
  inspector_name: string;
  roof_features: string;
  inspection_method: string;
  risk_items: RiskItem[];
  scope_of_works: string[];
  urgency: string;
}

export interface Report {
  id: string;
  user_id: string;
  title: string;
  status: ReportStatus;
  customer_id: string | null;
  property_address: string | null;
  inspection_date: string | null;
  report_date: string;
  sections: ReportSection[];
  photos: ReportPhoto[];
  meta: ReportMeta;
  created_at: string;
  updated_at: string;
}

export type ReportWithCustomer = Report & {
  customers: Pick<Customer, "id" | "name" | "email" | "company"> | null;
};

// ----------------------------------------------------------------
// WORK ORDERS
// ----------------------------------------------------------------

export type WorkOrderStatus = 'draft' | 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'completed' | 'cancelled';

export interface WorkOrderPhoto {
  id: string;
  url: string;
  storagePath: string;
  order: number;
  uploadedBy: string;
  phase?: 'before' | 'progress' | 'after';
  caption?: string;
}

export interface MemberProfile {
  id: string;
  business_id: string;
  user_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  role_title: string | null;
  skills: string[];
  bio: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  business_id: string;
  user_id: string;
  number: string;
  title: string;
  description: string | null;
  customer_id: string | null;
  property_address: string | null;
  status: WorkOrderStatus;
  assigned_to: string | null;
  assigned_to_email: string | null;
  assigned_to_profile_id: string | null;
  scope_of_work: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  photos: WorkOrderPhoto[];
  worker_notes: string | null;
  // Property-mgmt model
  site_id: string | null;
  booker_contact_id: string | null;
  onsite_contact_id: string | null;
  billing_profile_id: string | null;
  cc_contact_ids: string[];
  reported_issue: string | null;
  started_at: string | null;
  completed_at: string | null;
  share_token: string | null;
  share_enabled_at: string | null;
  recurring_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringJobCadence = "weekly" | "fortnightly" | "monthly" | "quarterly";

export interface RecurringJob {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  title: string;
  description: string | null;
  customer_id: string | null;
  site_id: string | null;
  property_address: string | null;
  reported_issue: string | null;
  member_profile_ids: string[];
  cadence: RecurringJobCadence;
  preferred_weekday: number | null;
  preferred_day_of_month: number | null;
  preferred_start_time: string | null;
  preferred_duration_minutes: number | null;
  generate_days_ahead: number;
  next_occurrence_at: string;
  last_generated_at: string | null;
  active: boolean;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPortalToken {
  token: string;
  business_id: string;
  customer_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface WorkOrderAssignment {
  id: string;
  work_order_id: string;
  business_id: string;
  member_profile_id: string;
  assigned_by: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export type ScheduledJob = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'phone'> | null;
  work_order_assignments: Array<{
    id: string;
    member_profile_id: string;
    member_profiles: Pick<MemberProfile, 'id' | 'name' | 'email' | 'phone' | 'avatar_url' | 'role_title'> | null;
  }>;
};

export type WorkOrderWithCustomer = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company'> | null;
};

export type WorkOrderWithDetails = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company'> | null;
  assigned_profile: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'> | null;
};

// ----------------------------------------------------------------
// LEADS
// ----------------------------------------------------------------

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type LeadSource = "landing-page" | "website" | "referral" | "telegram" | "email" | "phone" | "manual";

export interface Lead {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  suburb: string | null;
  address: string | null;
  service: string | null;
  property_type: string | null;
  timing: string | null;
  notes: string | null;
  status: LeadStatus;
  source: LeadSource;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  customer_id: string | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------
// CUSTOMER HUB
// ----------------------------------------------------------------

export interface CustomerProperty {
  id: string;
  business_id: string;
  customer_id: string;
  label: string | null;
  address: string;
  city: string | null;
  postcode: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerContact {
  id: string;
  business_id: string;
  customer_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface CustomerNote {
  id: string;
  business_id: string;
  customer_id: string;
  content: string;
  created_at: string;
}

// ----------------------------------------------------------------
// ACCOUNTS / SITES / CONTACTS / BILLING (property-mgmt model)
// ----------------------------------------------------------------
// Note: the `customers` table is the "Account" backing — no rename.

export type AccountType = 'individual' | 'property_mgmt' | 'commercial' | 'strata' | 'other';
export type ContactRole = 'owner' | 'pm' | 'tenant' | 'super' | 'primary' | 'accounts' | 'other';
export type SiteContactRole = 'tenant' | 'super' | 'owner_onsite' | 'primary' | 'other';

export interface Site {
  id: string;
  business_id: string;
  account_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  access_notes: string | null;
  gate_code: string | null;
  parking_notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  business_id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: ContactRole;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteContact {
  site_id: string;
  contact_id: string;
  role: SiteContactRole;
  is_primary: boolean;
  created_at: string;
}

export interface BillingProfile {
  id: string;
  business_id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  tax_number: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_default: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteBilling {
  site_id: string;
  billing_profile_id: string;
  created_at: string;
}

// ----------------------------------------------------------------
// SITE ASSETS (equipment register)
// ----------------------------------------------------------------

export interface SiteAsset {
  id: string;
  business_id: string;
  site_id: string;
  name: string;
  type: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  warranty_expiry: string | null;
  last_serviced: string | null;
  notes: string | null;
  photos: { url: string; caption?: string }[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteAssetJob {
  asset_id: string;
  work_order_id: string;
  action: 'inspected' | 'serviced' | 'repaired' | 'replaced' | 'installed' | 'removed';
  notes: string | null;
  created_at: string;
}

// ----------------------------------------------------------------
// JOB PORTFOLIO TABLES
// ----------------------------------------------------------------

export type JobTimelineEventType =
  | 'created'
  | 'status_change'
  | 'assigned'
  | 'unassigned'
  | 'scheduled'
  | 'rescheduled'
  | 'arrived'
  | 'departed'
  | 'photo_added'
  | 'note_added'
  | 'message_sent'
  | 'message_received'
  | 'quote_sent'
  | 'quote_viewed'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'invoice_sent'
  | 'invoice_viewed'
  | 'invoice_paid'
  | 'time_started'
  | 'time_ended'
  | 'material_added'
  | 'signature_captured'
  | 'form_completed'
  | 'scope_change'
  | 'document_uploaded'
  | 'review_requested'
  | 'review_received';

export interface JobTimelineEvent {
  id: string;
  business_id: string;
  work_order_id: string;
  type: JobTimelineEventType;
  actor_type: 'user' | 'system' | 'customer';
  actor_id: string | null;
  actor_label: string | null;
  payload: Record<string, unknown>;
  visible_to_customer: boolean;
  occurred_at: string;
  created_at: string;
}

export type JobPhotoPhase = 'before' | 'during' | 'after' | 'reference';

export interface JobPhoto {
  id: string;
  business_id: string;
  work_order_id: string;
  url: string;
  phase: JobPhotoPhase;
  caption: string | null;
  lat: number | null;
  lng: number | null;
  taken_by: string | null;
  taken_at: string;
  annotations: unknown[];
  customer_visible: boolean;
  created_at: string;
}

export interface JobTimeEntry {
  id: string;
  business_id: string;
  work_order_id: string;
  member_profile_id: string | null;
  user_id: string | null;
  type: 'work' | 'travel' | 'break';
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  invoice_id: string | null;
  invoiced_at: string | null;
  created_at: string;
}

export interface JobMaterial {
  id: string;
  business_id: string;
  work_order_id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit: string | null;
  unit_cost: number;
  unit_price: number;
  added_by: string | null;
  added_at: string;
  billable: boolean;
  invoice_id: string | null;
  invoiced_at: string | null;
}

export interface JobSignature {
  id: string;
  business_id: string;
  work_order_id: string;
  signed_by_name: string;
  signed_by_role: string | null;
  signature_url: string;
  purpose: 'quote' | 'completion' | 'change_order' | 'safety' | 'other';
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface JobDocument {
  id: string;
  business_id: string;
  work_order_id: string;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: 'permit' | 'warranty' | 'certificate' | 'insurance' | 'manual' | 'contract' | 'other';
  uploaded_by: string | null;
  uploaded_at: string;
  customer_visible: boolean;
}

export interface JobFormTemplate {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  schema: unknown[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobForm {
  id: string;
  business_id: string;
  work_order_id: string;
  template_id: string | null;
  name: string;
  responses: Record<string, unknown>;
  completed_by: string | null;
  completed_at: string | null;
  signature_url: string | null;
  created_at: string;
}

export interface JobShareToken {
  token: string;
  business_id: string;
  work_order_id: string;
  expires_at: string | null;
  revoked: boolean;
  created_by: string | null;
  created_at: string;
}

// ----------------------------------------------------------------
// EMAIL CONFIG
// ----------------------------------------------------------------

export type EmailProvider = 'gmail' | 'outlook' | 'yahoo' | 'hostinger' | 'custom';

export const EMAIL_PROVIDERS: { value: EmailProvider; label: string; host: string; port: number; help: string }[] = [
  { value: 'gmail',     label: 'Gmail / Google Workspace', host: 'imap.gmail.com',           port: 993, help: 'Use an App Password: Google Account > Security > 2-Step Verification > App Passwords' },
  { value: 'outlook',   label: 'Outlook / Microsoft 365',  host: 'outlook.office365.com',    port: 993, help: 'Use your password, or an App Password if 2FA is enabled' },
  { value: 'yahoo',     label: 'Yahoo Mail',               host: 'imap.mail.yahoo.com',      port: 993, help: 'Generate an App Password in Yahoo Account Security settings' },
  { value: 'hostinger', label: 'Hostinger',                host: 'imap.hostinger.com',        port: 993, help: 'Use your Hostinger email password' },
  { value: 'custom',    label: 'Custom IMAP',              host: '',                          port: 993, help: 'Enter your IMAP server details manually' },
];

export interface BusinessEmailConfig {
  id: string;
  business_id: string;
  enabled: boolean;
  provider: EmailProvider;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------
// WEBHOOKS
// ----------------------------------------------------------------

export type WebhookEvent =
  | 'lead.created'
  | 'lead.updated'
  | 'customer.created'
  | 'customer.updated'
  | 'invoice.created'
  | 'invoice.sent'
  | 'invoice.paid'
  | 'invoice.overdue'
  | 'quote.created'
  | 'quote.sent'
  | 'quote.accepted'
  | 'quote.rejected'
  | 'payment.received'
  | 'work_order.created'
  | 'work_order.completed';

export const ALL_WEBHOOK_EVENTS: { value: WebhookEvent; label: string; group: string }[] = [
  { value: 'lead.created',          label: 'Lead created',          group: 'Leads' },
  { value: 'lead.updated',          label: 'Lead updated',          group: 'Leads' },
  { value: 'customer.created',      label: 'Customer created',      group: 'Customers' },
  { value: 'customer.updated',      label: 'Customer updated',      group: 'Customers' },
  { value: 'invoice.created',       label: 'Invoice created',       group: 'Invoices' },
  { value: 'invoice.sent',          label: 'Invoice sent',          group: 'Invoices' },
  { value: 'invoice.paid',          label: 'Invoice paid',          group: 'Invoices' },
  { value: 'invoice.overdue',       label: 'Invoice overdue',       group: 'Invoices' },
  { value: 'quote.created',         label: 'Quote created',         group: 'Quotes' },
  { value: 'quote.sent',            label: 'Quote sent',            group: 'Quotes' },
  { value: 'quote.accepted',        label: 'Quote accepted',        group: 'Quotes' },
  { value: 'quote.rejected',        label: 'Quote rejected',        group: 'Quotes' },
  { value: 'payment.received',      label: 'Payment received',      group: 'Payments' },
  { value: 'work_order.created',    label: 'Work order created',    group: 'Work Orders' },
  { value: 'work_order.completed',  label: 'Work order completed',  group: 'Work Orders' },
];

export interface BusinessWebhook {
  id: string;
  business_id: string;
  url: string;
  label: string;
  events: WebhookEvent[];
  secret: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status_code: number | null;
  success: boolean;
  payload: unknown;
  response_body: string | null;
  error: string | null;
  created_at: string;
}

// ----------------------------------------------------------------
// API KEYS
// ----------------------------------------------------------------

export type ApiScope =
  | 'leads:read'
  | 'leads:write'
  | 'customers:read'
  | 'customers:write'
  | 'agent:access';

export const ALL_API_SCOPES: { value: ApiScope; label: string; group: string }[] = [
  { value: 'leads:read',      label: 'Read leads',      group: 'Leads' },
  { value: 'leads:write',     label: 'Create leads',    group: 'Leads' },
  { value: 'customers:read',  label: 'Read customers',  group: 'Customers' },
  { value: 'customers:write', label: 'Create customers', group: 'Customers' },
  { value: 'agent:access',    label: 'AI Agent access',  group: 'Agent' },
];

export interface BusinessApiKey {
  id: string;
  business_id: string;
  user_id: string;
  label: string;
  key_prefix: string;
  key_hash: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export type MemberRole = 'admin' | 'editor' | 'viewer';
export type MemberStatus = 'pending' | 'active';

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string | null;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  added_by: string | null;
  created_at: string;
}

// Database interface for Supabase client
export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: Business;
        Insert: Omit<Business, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Business, "id" | "created_at" | "updated_at">>;
      };
      customers: {
        Row: Customer;
        Insert: Omit<Customer, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Customer, "id" | "created_at" | "updated_at">>;
      };
      products: {
        Row: Product;
        Insert: Omit<Product, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Product, "id" | "created_at" | "updated_at">>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Invoice, "id" | "created_at" | "updated_at">>;
      };
      quotes: {
        Row: Quote;
        Insert: Omit<Quote, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Quote, "id" | "created_at" | "updated_at">>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, "id" | "created_at">;
        Update: Partial<Omit<Payment, "id" | "created_at">>;
      };
      reports: {
        Row: Report;
        Insert: Omit<Report, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Report, "id" | "created_at" | "updated_at">>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Lead, "id" | "created_at" | "updated_at">>;
      };
      business_api_keys: {
        Row: BusinessApiKey;
        Insert: Omit<BusinessApiKey, "id" | "created_at">;
        Update: Partial<Omit<BusinessApiKey, "id" | "created_at">>;
      };
      business_email_config: {
        Row: BusinessEmailConfig;
        Insert: Omit<BusinessEmailConfig, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<BusinessEmailConfig, "id" | "created_at" | "updated_at">>;
      };
      business_webhooks: {
        Row: BusinessWebhook;
        Insert: Omit<BusinessWebhook, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<BusinessWebhook, "id" | "created_at" | "updated_at">>;
      };
      webhook_deliveries: {
        Row: WebhookDelivery;
        Insert: Omit<WebhookDelivery, "id" | "created_at">;
        Update: Partial<Omit<WebhookDelivery, "id" | "created_at">>;
      };
    };
  };
}
