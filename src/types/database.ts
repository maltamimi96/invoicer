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
  state: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  tax_number: string | null;
  /** Trade licence / registration number — shown on PDFs (reports, invoices, quotes). */
  license_number: string | null;
  /** Alphanumeric Sender ID (≤11 chars) shown to customers on SMS. */
  sms_sender_id: string | null;
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
  state: string | null;
  postcode: string | null;
  country: string | null;
  company: string | null;
  tax_number: string | null;
  notes: string | null;
  account_type:
    | 'residential' | 'commercial' | 'developer' | 'agent' | 'builder'
    | 'strata' | 'property_mgmt' | 'government' | 'non_profit' | 'other'
    | 'individual';
  website: string | null;
  secondary_phone: string | null;
  contact_role: string | null;
  preferred_contact: 'email' | 'phone' | 'sms' | 'any' | null;
  /** Payment methods this customer may use. NULL = all the business supports. */
  allowed_payment_methods: string[] | null;
  /** Card-on-file / autopay (Stripe ids live on the business's connected account). */
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_pm_brand: string | null;
  stripe_pm_last4: string | null;
  stripe_pm_exp: string | null;
  autopay_enabled: boolean;
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
  site_id: string | null;
  property_address: string | null;
  parent_invoice_id?: string | null;
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
  site_id: string | null;
  property_address: string | null;
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
  /** Optional licence/registration number to display next to the inspector. */
  inspector_license?: string;
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
  /** Billing: generate + (optionally) auto-charge an invoice each occurrence. */
  auto_invoice: boolean;
  invoice_line_items: LineItem[];
  auto_charge: boolean;
  created_at: string;
  updated_at: string;
}

/** Subscription-style schedule: auto-generate + auto-charge an invoice each cycle. */
export interface RecurringInvoice {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  customer_id: string;
  line_items: LineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  terms: string | null;
  cadence: RecurringJobCadence;
  preferred_day_of_month: number | null;
  due_days: number;
  next_run_on: string;
  ends_on: string | null;
  auto_charge: boolean;
  send_email: boolean;
  active: boolean;
  last_invoice_id: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided';

export interface ContractTemplate {
  id: string;
  business_id: string;
  name: string;
  content_html: string;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  business_id: string;
  user_id: string;
  customer_id: string | null;
  title: string;
  kind: 'rich_text' | 'pdf';
  content_html: string | null;
  source_path: string | null;
  status: ContractStatus;
  signer_name: string | null;
  signer_email: string | null;
  provider: string | null;
  provider_request_id: string | null;
  signed_path: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ── Client onboarding (per-business form builder, feature-flagged) ──────────

export type OnboardingFieldType =
  | 'short_text' | 'long_text' | 'instructions'
  | 'email' | 'phone' | 'url' | 'address'
  | 'abn' | 'company'
  | 'dropdown' | 'multi_select' | 'radio' | 'checkboxes' | 'yes_no'
  | 'number' | 'currency' | 'date' | 'time' | 'opening_hours'
  | 'file' | 'image'
  | 'rating' | 'secure' | 'consent'
  | 'heading' | 'divider';

export interface OnboardingField {
  id: string;                       // stable key answers are stored under
  type: OnboardingFieldType;
  label: string;
  help_text?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];               // dropdown / multi_select / radio / checkboxes
  /** Simple conditional visibility: show when another field equals a value. */
  show_if?: { field_id: string; equals: string } | null;
  /** Preset key (e.g. "instagram", "abn") — drives format validation and
   *  smart rendering (handle → profile link) in the response viewer. */
  preset?: string;
  /** Custom regex validation applied on submit (in addition to type/preset checks). */
  validation?: { pattern?: string; message?: string };
}

export type OnboardingFormStatus = 'draft' | 'active' | 'archived';

export interface OnboardingForm {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  status: OnboardingFormStatus;
  schema: OnboardingField[];
  settings: { thank_you_message?: string; allow_edit_after_submit?: boolean };
  created_at: string;
  updated_at: string;
}

export type OnboardingRequestStatus = 'pending' | 'viewed' | 'completed';

export interface OnboardingRequest {
  id: string;
  business_id: string;
  form_id: string;
  customer_id: string;
  status: OnboardingRequestStatus;
  sent_at: string;
  viewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Secure ("secure" type) answers are stored as { enc: string } — AES-256-GCM,
 *  decrypted only server-side on explicit reveal. Files/images store the
 *  storage path; everything else stores the raw value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnboardingAnswers = Record<string, any>;

export interface OnboardingResponse {
  id: string;
  business_id: string;
  request_id: string;
  form_id: string;
  customer_id: string;
  answers: OnboardingAnswers;
  schema_snapshot: OnboardingField[];
  draft: boolean;
  submitted_at: string | null;
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
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company' | 'phone' | 'address' | 'city' | 'postcode'> | null;
};

export type WorkOrderWithDetails = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company' | 'phone'> | null;
  assigned_profile: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'> | null;
};

// ----------------------------------------------------------------
// LEADS
// ----------------------------------------------------------------

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
/** Built-in lead source presets. The DB column is now free-text, so any
 *  string is valid — these are just the suggestions the UI offers in the
 *  source dropdown alongside whatever past values exist for the business. */
export const BUILT_IN_LEAD_SOURCES = [
  "manual", "website", "landing-page", "referral", "phone",
  "email", "telegram", "hipages", "service-seeking", "google",
  "facebook", "instagram", "word-of-mouth",
] as const;
export type LeadSource = string;

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
  /** Distinct sources this lead has come in from (e.g. ["email","airtasker"]). */
  sources?: string[];
  /** Append-only audit of every ingest: [{source, ref, at}]. */
  source_refs?: Array<{ source?: string; ref?: string | null; message_id?: string | null; at?: string }>;
  /** Most recent ingest timestamp; differs from updated_at when a row is merged. */
  last_seen_at?: string;
  /** Generated key for dedup — read-only, computed from email/phone/name+address. */
  identity_key?: string | null;
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
  state: string | null;
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
export type AccountContactRole = 'owner' | 'pm' | 'tenant' | 'super' | 'primary' | 'accounts' | 'other';
/** @deprecated Use AccountContactRole. */
export type ContactRole = AccountContactRole;
export type SiteContactRole = 'tenant' | 'super' | 'owner_onsite' | 'primary' | 'other';

export interface Site {
  id: string;
  business_id: string;
  account_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
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

/** A person attached to a customer account (PM, tenant, primary, etc). */
export interface AccountContact {
  id: string;
  business_id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: AccountContactRole;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type LifecycleStage = 'lead' | 'contact' | 'customer';

/** Top-level CRM contact. Lifecycle: lead -> contact -> customer. */
export interface Contact {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  lifecycle_stage: LifecycleStage;
  source_lead_id: string | null;
  customer_id: string | null;
  tags: string[];
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
  | 'work_order.completed'
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.rescheduled'
  | 'booking.cancelled'
  | 'booking.reminder'
  | 'booking.no_show';

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
  { value: 'booking.created',       label: 'Booking created',       group: 'Bookings' },
  { value: 'booking.confirmed',     label: 'Booking confirmed',     group: 'Bookings' },
  { value: 'booking.rescheduled',   label: 'Booking rescheduled',   group: 'Bookings' },
  { value: 'booking.cancelled',     label: 'Booking cancelled',     group: 'Bookings' },
  { value: 'booking.reminder',      label: 'Booking reminder',      group: 'Bookings' },
  { value: 'booking.no_show',       label: 'Booking no-show',       group: 'Bookings' },
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
  | 'quotes:read'
  | 'quotes:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'work_orders:read'
  | 'work_orders:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'products:read'
  | 'products:write'
  | 'settings:read'
  | 'settings:write'
  | 'bookings:read'
  | 'bookings:write'
  | 'contracts:read'
  | 'contracts:write'
  | 'onboarding:read'
  | 'onboarding:write'
  | 'email:send'
  | 'agent:access'
  | 'admin';  // wildcard — grants every scope (use for trusted Claude Code keys)

export const ALL_API_SCOPES: { value: ApiScope; label: string; group: string }[] = [
  { value: 'admin',            label: 'Full admin (everything)', group: 'Admin' },
  { value: 'leads:read',       label: 'Read leads',        group: 'Leads' },
  { value: 'leads:write',      label: 'Create / edit leads', group: 'Leads' },
  { value: 'customers:read',   label: 'Read customers',    group: 'Customers' },
  { value: 'customers:write',  label: 'Create / edit customers', group: 'Customers' },
  { value: 'quotes:read',      label: 'Read quotes',       group: 'Quotes' },
  { value: 'quotes:write',     label: 'Create / edit quotes', group: 'Quotes' },
  { value: 'invoices:read',    label: 'Read invoices',     group: 'Invoices' },
  { value: 'invoices:write',   label: 'Create / edit invoices', group: 'Invoices' },
  { value: 'work_orders:read', label: 'Read work orders',  group: 'Work orders' },
  { value: 'work_orders:write',label: 'Create / edit work orders', group: 'Work orders' },
  { value: 'tasks:read',       label: 'Read tasks',        group: 'Tasks' },
  { value: 'tasks:write',      label: 'Create / edit tasks', group: 'Tasks' },
  { value: 'products:read',    label: 'Read products',     group: 'Products' },
  { value: 'products:write',   label: 'Create / edit products', group: 'Products' },
  { value: 'settings:read',    label: 'Read settings',     group: 'Settings' },
  { value: 'settings:write',   label: 'Edit settings & preferences', group: 'Settings' },
  { value: 'bookings:read',    label: 'Read bookings & config', group: 'Bookings' },
  { value: 'bookings:write',   label: 'Manage bookings & config', group: 'Bookings' },
  { value: 'contracts:read',   label: 'Read contracts',    group: 'Contracts' },
  { value: 'contracts:write',  label: 'Create / send contracts', group: 'Contracts' },
  { value: 'onboarding:read',  label: 'Read onboarding forms & responses (secure fields redacted)', group: 'Onboarding' },
  { value: 'onboarding:write', label: 'Create / send onboarding forms', group: 'Onboarding' },
  { value: 'email:send',       label: 'Send emails to customers', group: 'Email' },
  { value: 'agent:access',     label: 'AI Agent access',   group: 'Agent' },
];

/** Expand the `admin` wildcard into the concrete scope set, and dedupe. */
export function expandApiScopes(scopes: ApiScope[]): ApiScope[] {
  if (!scopes.includes('admin')) return scopes;
  return ALL_API_SCOPES.map((s) => s.value).filter((s) => s !== 'admin');
}

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

export type MemberRole = 'admin' | 'editor' | 'viewer' | 'worker';
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

// ============================================================================
// Work-order templates — predefined starting points for new work orders.
// ============================================================================
export interface WorkOrderTemplate {
  id: string;
  business_id: string;
  name: string;
  title: string | null;
  description: string | null;
  scope_of_work: string | null;
  worker_notes: string | null;
  reported_issue: string | null;
  default_duration_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Per-business email template override — see src/lib/emails/templates.ts. */
export interface EmailTemplate {
  id: string;
  business_id: string;
  template_type: 'invoice' | 'quote' | 'team_invite' | 'work_order_submitted' | 'payment_receipt';
  subject: string | null;
  greeting: string | null;
  intro: string | null;
  footer_note: string | null;
  accent_color: string | null;
  show_line_items: boolean;
  show_payment_details: boolean;
  show_buttons: boolean;
  custom_html: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Online Booking / Appointments
// ============================================================================
export type AppointmentStatus =
  | 'pending' | 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show';
export type BookingSource = 'web' | 'embed' | 'api' | 'admin';
export type CaptchaProvider = 'turnstile' | 'hcaptcha';

export interface BookingSettings {
  business_id: string;
  enabled: boolean;
  slug: string | null;
  timezone: string;
  min_lead_minutes: number;
  max_advance_days: number;
  slot_granularity_minutes: number;
  default_buffer_minutes: number;
  max_per_day: number | null;
  require_phone: boolean;
  require_email: boolean;
  require_address: boolean;
  show_resource_names: boolean;
  confirmation_message: string | null;
  cancellation_window_hours: number;
  reminder_offsets: number[];
  create_lead: boolean;
  create_work_order: boolean;
  brand_logo_url: string | null;
  brand_color: string | null;
  captcha_provider: CaptchaProvider | null;
  captcha_site_key: string | null;
  captcha_secret_key: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  notify_customer_email: boolean;
  notify_customer_sms: boolean;
  notify_team_email: boolean;
  team_notify_email: string | null;
  created_at: string;
  updated_at: string;
}

/** A single bookable form. Superset of the per-business rule fields plus its
 *  own slug/name/branding and the subset of services + resources it exposes. */
export interface BookingForm {
  id: string;
  business_id: string;
  name: string;
  slug: string | null;
  enabled: boolean;
  timezone: string;
  min_lead_minutes: number;
  max_advance_days: number;
  slot_granularity_minutes: number;
  default_buffer_minutes: number;
  max_per_day: number | null;
  require_phone: boolean;
  require_email: boolean;
  require_address: boolean;
  show_resource_names: boolean;
  confirmation_message: string | null;
  cancellation_window_hours: number;
  reminder_offsets: number[];
  create_lead: boolean;
  create_work_order: boolean;
  brand_logo_url: string | null;
  brand_color: string | null;
  captcha_provider: CaptchaProvider | null;
  captcha_site_key: string | null;
  captcha_secret_key: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  notify_customer_email: boolean;
  notify_customer_sms: boolean;
  notify_team_email: boolean;
  team_notify_email: string | null;
  appointment_type_ids: string[];
  resource_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AppointmentType {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number | null;
  price_display: string | null;
  color: string | null;
  active: boolean;
  eligible_resource_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BookingResource {
  id: string;
  business_id: string;
  member_profile_id: string | null;
  display_name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BookingWorkingHours {
  id: string;
  business_id: string;
  resource_id: string;
  weekday: number; // 0=Sun .. 6=Sat
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  created_at: string;
}

export interface BookingAvailabilityException {
  id: string;
  business_id: string;
  resource_id: string | null;
  date: string; // 'YYYY-MM-DD'
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  appointment_type_id: string | null;
  resource_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: BookingSource;
  manage_token: string;
  form_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  work_order_id: string | null;
  idempotency_key: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingHold {
  id: string;
  business_id: string;
  resource_id: string;
  appointment_type_id: string | null;
  starts_at: string;
  ends_at: string;
  hold_token: string;
  expires_at: string;
  created_at: string;
}

/** A bookable slot returned by the availability engine (Phase 2). */
export interface BookingSlot {
  start: string;        // UTC ISO
  end: string;          // UTC ISO
  resource_id: string;
  resource_name: string; // public-safe display_name only
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
