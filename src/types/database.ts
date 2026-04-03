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
  archived: boolean;
  created_at: string;
  updated_at: string;
}

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

export interface WorkOrderUpdatePhoto {
  id: string;
  url: string;
  storagePath: string;
  phase: 'before' | 'progress' | 'after';
  caption: string;
  order: number;
}

export interface WorkOrderUpdate {
  id: string;
  work_order_id: string;
  business_id: string;
  author_user_id: string | null;
  author_email: string;
  author_name: string;
  content: string;
  photos: WorkOrderUpdatePhoto[];
  created_at: string;
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
  photos: WorkOrderPhoto[];
  worker_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkOrderWithCustomer = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company'> | null;
};

export type WorkOrderWithDetails = WorkOrder & {
  customers: Pick<Customer, 'id' | 'name' | 'email' | 'company'> | null;
  assigned_profile: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'> | null;
};

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
    };
  };
}
