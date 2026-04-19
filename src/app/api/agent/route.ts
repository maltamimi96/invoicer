import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { createWorkOrder, updateWorkOrderStatus } from "@/lib/actions/work-orders";
import { createQuote, updateQuote, sendQuoteEmail, convertQuoteToInvoice } from "@/lib/actions/quotes";
import { createInvoice, updateInvoice, sendInvoiceEmail, addPayment } from "@/lib/actions/invoices";
import { getProducts, createProduct } from "@/lib/actions/products";
import { createReport } from "@/lib/actions/reports";
import { createSite } from "@/lib/actions/sites";
import { createContact } from "@/lib/actions/contacts";
import { createBillingProfile, updateBillingProfile, archiveBillingProfile, setSiteBilling } from "@/lib/actions/billing-profiles";
import { enableWorkOrderShareLink, disableWorkOrderShareLink, invoiceUnbilledForWorkOrder } from "@/lib/actions/work-orders";
import { updateWorkOrder } from "@/lib/actions/work-orders";
import { addJobMaterial, getJobMaterials, deleteJobMaterial } from "@/lib/actions/job-materials";
import { startTimeEntry, stopTimeEntry, logTimeEntry, getJobTimeEntries } from "@/lib/actions/job-time";
import { addJobDocument, getJobDocuments } from "@/lib/actions/job-documents";
import { getJobPhotos, updateJobPhoto } from "@/lib/actions/job-photos";
import { addJobNote, getJobTimeline } from "@/lib/actions/job-timeline";
import { getWorkOrderFinancials, linkFinancialToWorkOrder } from "@/lib/actions/work-orders";
import { getLeads, createLead, updateLeadStatus, convertLeadToCustomer, convertLeadToQuote, convertLeadToWorkOrder } from "@/lib/actions/leads";
import { getRecurringJobs, createRecurringJob, setRecurringJobActive, deleteRecurringJob } from "@/lib/actions/recurring-jobs";
import { parseWhen } from "@/lib/ai/resolvers";
import { v4 as uuidv4 } from "uuid";
import type { LineItem } from "@/types/database";

const anthropic = new Anthropic();

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Customers ──────────────────────────────────────────────────────────────
  {
    name: "search_customers",
    description: "Search for existing customers by name, email, or company. Always call this before creating a new customer to avoid duplicates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name, email, or company to search" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer record",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_customer",
    description: "Update an existing customer's details",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        name: { type: "string" },
        company: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_customer_details",
    description: "Get a customer's full details including their recent work orders, quotes, and invoices",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
      },
      required: ["customer_id"],
    },
  },

  // ── Products ───────────────────────────────────────────────────────────────
  {
    name: "search_products",
    description: "Search the product/service catalog by name. Use this to find stored items and their prices before creating quotes.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Product name or keyword to search. Use empty string to list all products." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_product",
    description: "Add a new product or service to the catalog with a set price",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        unit_price: { type: "number", description: "Price excluding tax" },
        tax_rate: { type: "number", description: "Tax rate as percentage, e.g. 10 for 10%" },
        unit: { type: "string", description: "Unit of measure, e.g. 'ea', 'hr', 'm2'" },
      },
      required: ["name", "unit_price"],
    },
  },

  // ── Sites / Contacts / Billing Profiles ───────────────────────────────────
  {
    name: "search_sites",
    description: "Search sites (properties) for an account. Use after picking an account to find a specific property.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Address, label, city, or postcode" },
        account_id: { type: "string", description: "Optional account to limit search to" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_site",
    description: "Create a new site (property) under an account",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string" },
        label: { type: "string", description: "Optional friendly label e.g. 'Unit 4A'" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
        access_notes: { type: "string" },
        gate_code: { type: "string" },
        parking_notes: { type: "string" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "search_contacts",
    description: "Search contacts (people) under an account — property managers, tenants, supers, owners",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        account_id: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_contact",
    description: "Add a new contact (person) under an account",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        role: { type: "string", enum: ["primary", "property_manager", "tenant", "super", "owner", "billing", "other"] },
        notes: { type: "string" },
      },
      required: ["account_id", "name"],
    },
  },
  {
    name: "search_billing_profiles",
    description: "List or search billing profiles for an account (who pays the invoices)",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Optional name/email filter; pass empty string to list all" },
        account_id: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_billing_profile",
    description: "Create a billing profile under an account",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
        tax_number: { type: "string" },
        payment_terms: { type: "string" },
        is_default: { type: "boolean" },
      },
      required: ["account_id", "name"],
    },
  },
  {
    name: "update_billing_profile",
    description: "Update fields on an existing billing profile (name, contact info, payment terms, default flag)",
    input_schema: {
      type: "object" as const,
      properties: {
        billing_profile_id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
        tax_number: { type: "string" },
        payment_terms: { type: "string" },
        notes: { type: "string" },
        is_default: { type: "boolean" },
      },
      required: ["billing_profile_id"],
    },
  },
  {
    name: "archive_billing_profile",
    description: "Archive (soft-delete) a billing profile so it no longer appears in pickers",
    input_schema: {
      type: "object" as const,
      properties: {
        billing_profile_id: { type: "string" },
      },
      required: ["billing_profile_id"],
    },
  },
  {
    name: "set_site_billing",
    description: "Set which billing profile is used for a given site (overrides account default)",
    input_schema: {
      type: "object" as const,
      properties: {
        site_id: { type: "string" },
        billing_profile_id: { type: "string" },
      },
      required: ["site_id", "billing_profile_id"],
    },
  },

  // ── Workers ────────────────────────────────────────────────────────────────
  {
    name: "search_workers",
    description: "Search team members (workers) by name or email — call before assigning someone to a work order",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name or email; empty string lists all" },
      },
      required: ["query"],
    },
  },

  // ── Date/time parser ───────────────────────────────────────────────────────
  {
    name: "parse_when",
    description: "Parse a natural-language date/time phrase (e.g. 'tomorrow at 2pm', 'next monday 9am', 'in 3 days') into structured date and time fields. Use this when a user gives a fuzzy time and you need YYYY-MM-DD + HH:MM.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Natural language phrase" },
      },
      required: ["text"],
    },
  },

  // ── Work Orders ────────────────────────────────────────────────────────────
  {
    name: "create_work_order",
    description: "Create a new work order for a job. Prefer passing site_id (call search_sites first), and assign workers via member_profile_ids (call search_workers). Booker = who reported it; on-site = who lets the tech in. Reported issue = the customer's complaint in their words.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "Instructions for the worker" },
        reported_issue: { type: "string", description: "What the customer reported, verbatim if possible" },
        customer_id: { type: "string" },
        site_id: { type: "string" },
        booker_contact_id: { type: "string" },
        onsite_contact_id: { type: "string" },
        billing_profile_id: { type: "string" },
        property_address: { type: "string" },
        scheduled_date: { type: "string", description: "YYYY-MM-DD — use parse_when if user gave fuzzy date" },
        start_time: { type: "string", description: "HH:MM 24h" },
        end_time: { type: "string", description: "HH:MM 24h" },
        member_profile_ids: { type: "array", items: { type: "string" }, description: "Worker IDs to assign" },
      },
      required: ["title"],
    },
  },
  {
    name: "schedule_work_order",
    description: "Set or change a work order's scheduled date and/or time. Useful when user says things like 'move the Smith job to Friday at 10am'.",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        scheduled_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM 24h" },
        end_time: { type: "string", description: "HH:MM 24h" },
      },
      required: ["work_order_id"],
    },
  },
  {
    name: "assign_workers_to_work_order",
    description: "Assign one or more workers to an existing work order (replaces current assignments)",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        member_profile_ids: { type: "array", items: { type: "string" } },
      },
      required: ["work_order_id", "member_profile_ids"],
    },
  },

  // ── Job Portfolio: Photos / Time / Materials / Documents / Notes ───────────
  {
    name: "list_job_photos",
    description: "List photos for a work order, grouped by phase (before/during/after/reference)",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "tag_job_photo_phase",
    description: "Re-tag a photo's phase (before, during, after, or reference) or update its caption",
    input_schema: {
      type: "object" as const,
      properties: {
        photo_id: { type: "string" },
        phase: { type: "string", enum: ["before", "during", "after", "reference"] },
        caption: { type: "string" },
      },
      required: ["photo_id"],
    },
  },
  {
    name: "list_job_time_entries",
    description: "List time entries (work / travel / break) for a work order",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "start_job_timer",
    description: "Start a clock for a worker on a job. Use type 'work' (default), 'travel', or 'break'.",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        type: { type: "string", enum: ["work", "travel", "break"] },
        member_profile_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["work_order_id"],
    },
  },
  {
    name: "stop_job_timer",
    description: "Stop a running time entry. Computes duration automatically.",
    input_schema: {
      type: "object" as const,
      properties: { entry_id: { type: "string" }, notes: { type: "string" } },
      required: ["entry_id"],
    },
  },
  {
    name: "log_time_block",
    description: "Manually log a completed time block after the fact (e.g. 'I worked 2 hours yesterday on this job')",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        started_at: { type: "string", description: "ISO timestamp" },
        ended_at: { type: "string", description: "ISO timestamp" },
        type: { type: "string", enum: ["work", "travel", "break"] },
        member_profile_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["work_order_id", "started_at", "ended_at"],
    },
  },
  {
    name: "list_job_materials",
    description: "List materials used on a work order",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "add_job_material",
    description: "Add a material/part used on a work order. If linking to a catalog product, pass product_id (search the product catalog first).",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        name: { type: "string" },
        qty: { type: "number" },
        unit: { type: "string" },
        unit_cost: { type: "number" },
        unit_price: { type: "number" },
        product_id: { type: "string" },
        billable: { type: "boolean" },
      },
      required: ["work_order_id", "name", "qty"],
    },
  },
  {
    name: "delete_job_material",
    description: "Remove a material entry from a work order",
    input_schema: {
      type: "object" as const,
      properties: { material_id: { type: "string" } },
      required: ["material_id"],
    },
  },
  {
    name: "list_job_documents",
    description: "List documents (permits, warranties, certificates, etc.) attached to a work order",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "add_job_document",
    description: "Attach a document URL to a work order (file upload happens client-side first; pass the resulting URL here)",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
        category: { type: "string", enum: ["permit", "warranty", "certificate", "insurance", "manual", "contract", "other"] },
        customer_visible: { type: "boolean" },
      },
      required: ["work_order_id", "name", "url"],
    },
  },
  {
    name: "add_job_note",
    description: "Add a note to the job timeline. Use this when the user dictates a status update they want logged on the job.",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        content: { type: "string" },
        visible_to_customer: { type: "boolean" },
      },
      required: ["work_order_id", "content"],
    },
  },
  {
    name: "get_work_order_financials",
    description: "List quotes and invoices linked to a work order",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "link_quote_to_work_order",
    description: "Link an existing quote to a work order. Pass work_order_id=null to unlink.",
    input_schema: {
      type: "object" as const,
      properties: { quote_id: { type: "string" }, work_order_id: { type: "string" } },
      required: ["quote_id"],
    },
  },
  {
    name: "enable_work_order_share_link",
    description: "Generate (or return existing) a customer-facing share link for the job portfolio. Only customer-visible items are shown.",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "disable_work_order_share_link",
    description: "Revoke the customer-facing share link for a work order",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "invoice_unbilled_work",
    description: "Create a draft invoice from all unbilled time entries and billable materials on a work order. Time is rolled into a single Labor line item at the given hourly_rate. Travel time is excluded unless include_travel=true. Returns the new invoice id, number, and subtotal.",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        hourly_rate: { type: "number", description: "Labor rate per hour. Defaults to 0 if omitted." },
        include_travel: { type: "boolean", description: "Include travel-type time entries. Defaults to false." },
        due_in_days: { type: "number", description: "Invoice due date offset in days. Defaults to 14." },
      },
      required: ["work_order_id"],
    },
  },
  {
    name: "link_invoice_to_work_order",
    description: "Link an existing invoice to a work order. Pass work_order_id=null to unlink.",
    input_schema: {
      type: "object" as const,
      properties: { invoice_id: { type: "string" }, work_order_id: { type: "string" } },
      required: ["invoice_id"],
    },
  },
  {
    name: "get_job_timeline",
    description: "Get the full event timeline for a work order — every status change, photo, note, time entry, etc.",
    input_schema: {
      type: "object" as const,
      properties: { work_order_id: { type: "string" } },
      required: ["work_order_id"],
    },
  },
  {
    name: "update_work_order_status",
    description: "Update the status of a work order",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "assigned", "in_progress", "submitted", "completed", "cancelled"],
        },
      },
      required: ["work_order_id", "status"],
    },
  },
  {
    name: "list_work_orders",
    description: "List work orders, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["draft", "assigned", "in_progress", "submitted", "completed", "cancelled"],
        },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  {
    name: "list_leads",
    description: "List leads, optionally filtered by status",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["new", "contacted", "quoted", "won", "lost"] },
      },
    },
  },
  {
    name: "create_lead",
    description: "Capture a new sales lead from a phone call, walk-in, or referral. Source defaults to 'manual'.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        suburb: { type: "string" },
        service: { type: "string", description: "Service the lead is asking about" },
        property_type: { type: "string" },
        timing: { type: "string", description: "When they want the work done" },
        notes: { type: "string" },
        source: { type: "string", enum: ["landing-page", "website", "referral", "telegram", "email", "phone", "manual"] },
      },
      required: ["name"],
    },
  },
  {
    name: "update_lead_status",
    description: "Move a lead between pipeline stages (new → contacted → quoted → won/lost)",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        status: { type: "string", enum: ["new", "contacted", "quoted", "won", "lost"] },
      },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "convert_lead_to_customer",
    description: "Promote a lead into a customer record. Idempotent — if the lead already has a customer, returns it. Lead status moves to 'contacted'.",
    input_schema: {
      type: "object" as const,
      properties: { lead_id: { type: "string" } },
      required: ["lead_id"],
    },
  },
  {
    name: "convert_lead_to_quote",
    description: "Create a draft quote from a lead (auto-creates the customer if needed). Lead status moves to 'quoted'. Returns quote_id so you can immediately add line items via update_quote.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        expiry_days: { type: "number", description: "Days until quote expires. Default 30." },
        notes: { type: "string" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "convert_lead_to_work_order",
    description: "Create a draft work order from a lead (auto-creates the customer if needed). Lead status moves to 'won'. Use schedule_work_order afterwards if a date is known.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        scheduled_date: { type: "string", description: "YYYY-MM-DD — use parse_when for fuzzy dates" },
        member_profile_ids: { type: "array", items: { type: "string" }, description: "Workers to assign" },
      },
      required: ["lead_id"],
    },
  },

  // ── Recurring jobs ─────────────────────────────────────────────────────────
  {
    name: "list_recurring_jobs",
    description: "List recurring job schedules — the templates that auto-generate work orders on a cadence (weekly/fortnightly/monthly/quarterly).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_recurring_job",
    description: "Set up an automatic recurring schedule (e.g., monthly clean for a property). Cron generates each work order ahead of time.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Internal label, e.g. 'Smith Property — Monthly Clean'" },
        title: { type: "string", description: "Title for each generated work order" },
        description: { type: "string" },
        customer_id: { type: "string" },
        site_id: { type: "string" },
        property_address: { type: "string" },
        member_profile_ids: { type: "array", items: { type: "string" }, description: "Workers auto-assigned to each occurrence" },
        cadence: { type: "string", enum: ["weekly", "fortnightly", "monthly", "quarterly"] },
        preferred_weekday: { type: "number", description: "0=Sun..6=Sat (weekly/fortnightly only)" },
        preferred_day_of_month: { type: "number", description: "1..28 (monthly/quarterly only)" },
        preferred_start_time: { type: "string", description: "HH:MM 24h" },
        preferred_duration_minutes: { type: "number" },
        next_occurrence_at: { type: "string", description: "YYYY-MM-DD — first scheduled date" },
        ends_on: { type: "string", description: "YYYY-MM-DD — optional contract end" },
        generate_days_ahead: { type: "number", description: "How far ahead to materialize WOs. Default 14." },
      },
      required: ["name", "title", "cadence", "next_occurrence_at"],
    },
  },
  {
    name: "pause_recurring_job",
    description: "Pause a recurring schedule (no more auto-generated work orders until resumed)",
    input_schema: { type: "object" as const, properties: { recurring_job_id: { type: "string" } }, required: ["recurring_job_id"] },
  },
  {
    name: "resume_recurring_job",
    description: "Resume a paused recurring schedule",
    input_schema: { type: "object" as const, properties: { recurring_job_id: { type: "string" } }, required: ["recurring_job_id"] },
  },
  {
    name: "delete_recurring_job",
    description: "Permanently delete a recurring schedule. Already-generated work orders are kept.",
    input_schema: { type: "object" as const, properties: { recurring_job_id: { type: "string" } }, required: ["recurring_job_id"] },
  },

  // ── Quotes ─────────────────────────────────────────────────────────────────
  {
    name: "create_quote",
    description: "Create a quote for a customer. Search the product catalog first to use stored prices. If products don't exist, ask the user for prices or use reasonable estimates.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Price excluding tax" },
              tax_rate: { type: "number", description: "Tax rate %, default 10" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        terms: { type: "string" },
        expiry_days: { type: "number", description: "Days until expiry, default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "list_quotes",
    description: "List recent quotes, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },
  {
    name: "send_quote_email",
    description: "Email a quote PDF to the customer. Customer must have an email address.",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },
  {
    name: "update_quote_status",
    description: "Update a quote's status, e.g. mark it as accepted or rejected",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] },
      },
      required: ["quote_id", "status"],
    },
  },
  {
    name: "convert_quote_to_invoice",
    description: "Convert an accepted quote into an invoice",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  {
    name: "create_invoice",
    description: "Create an invoice for a customer",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              tax_rate: { type: "number" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        terms: { type: "string" },
        due_days: { type: "number", description: "Days until due, default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "list_invoices",
    description: "List recent invoices, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled", "partial"] },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },
  {
    name: "send_invoice_email",
    description: "Email an invoice PDF to the customer",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: { type: "string" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "record_payment",
    description: "Record a payment received against an invoice",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: { type: "string" },
        amount: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        method: { type: "string", description: "e.g. Bank transfer, Cash, Card" },
        reference: { type: "string" },
      },
      required: ["invoice_id", "amount"],
    },
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  {
    name: "create_report",
    description: "Create a new roof inspection report (draft) for a customer and property",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Report title, e.g. 'Roof Inspection — 42 Smith St'" },
        customer_id: { type: "string" },
        property_address: { type: "string" },
        inspection_date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        roof_type: { type: "string", description: "e.g. Colorbond, Terracotta tile, Concrete tile" },
        inspector_name: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_reports",
    description: "List recent inspection reports, optionally filtered by customer",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    name: "navigate_to",
    description: "Navigate the user to a page after completing a task",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "App path, e.g. /quotes/123 or /customers/456" },
        label: { type: "string", description: "Human-readable label, e.g. 'Quote QT-0004'" },
      },
      required: ["path", "label"],
    },
  },
];

// ── Tool labels ──────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_customers: "Searching customers",
  create_customer: "Creating customer",
  update_customer: "Updating customer",
  get_customer_details: "Loading customer details",
  search_products: "Searching product catalog",
  create_product: "Adding product to catalog",
  search_sites: "Searching sites",
  create_site: "Creating site",
  search_contacts: "Searching contacts",
  create_contact: "Adding contact",
  search_billing_profiles: "Fetching billing profiles",
  create_billing_profile: "Creating billing profile",
  update_billing_profile: "Updating billing profile",
  archive_billing_profile: "Archiving billing profile",
  set_site_billing: "Setting site bill-to",
  search_workers: "Searching workers",
  parse_when: "Parsing date",
  create_work_order: "Creating work order",
  update_work_order_status: "Updating work order status",
  list_work_orders: "Fetching work orders",
  schedule_work_order: "Scheduling work order",
  assign_workers_to_work_order: "Assigning workers",
  list_job_photos: "Loading photos",
  tag_job_photo_phase: "Re-tagging photo",
  list_job_time_entries: "Loading time entries",
  start_job_timer: "Starting timer",
  stop_job_timer: "Stopping timer",
  log_time_block: "Logging time",
  list_job_materials: "Loading materials",
  add_job_material: "Adding material",
  delete_job_material: "Removing material",
  list_job_documents: "Loading documents",
  add_job_document: "Attaching document",
  add_job_note: "Adding note to job",
  get_job_timeline: "Loading job timeline",
  get_work_order_financials: "Loading linked quotes/invoices",
  link_quote_to_work_order: "Linking quote",
  enable_work_order_share_link: "Generating share link",
  disable_work_order_share_link: "Revoking share link",
  link_invoice_to_work_order: "Linking invoice",
  invoice_unbilled_work: "Invoicing unbilled work",
  list_leads: "Fetching leads",
  create_lead: "Capturing lead",
  update_lead_status: "Updating lead",
  convert_lead_to_customer: "Converting lead to customer",
  convert_lead_to_quote: "Converting lead to quote",
  convert_lead_to_work_order: "Converting lead to work order",
  list_recurring_jobs: "Loading recurring schedules",
  create_recurring_job: "Setting up recurring schedule",
  pause_recurring_job: "Pausing recurring schedule",
  resume_recurring_job: "Resuming recurring schedule",
  delete_recurring_job: "Deleting recurring schedule",
  create_quote: "Creating quote",
  list_quotes: "Fetching quotes",
  send_quote_email: "Sending quote email",
  update_quote_status: "Updating quote",
  convert_quote_to_invoice: "Converting quote to invoice",
  create_invoice: "Creating invoice",
  list_invoices: "Fetching invoices",
  send_invoice_email: "Sending invoice email",
  record_payment: "Recording payment",
  create_report: "Creating inspection report",
  list_reports: "Fetching reports",
  navigate_to: "Navigating",
};

// ── Line item builder ────────────────────────────────────────────────────────

function buildLineItems(
  raw: Array<{ name: string; description?: string; quantity?: number; unit_price: number; tax_rate?: number }>
): LineItem[] {
  return raw.map((item) => {
    const quantity = item.quantity ?? 1;
    const unit_price = item.unit_price;
    const tax_rate = item.tax_rate ?? 10;
    const subtotal = quantity * unit_price;
    const tax_amount = (subtotal * tax_rate) / 100;
    return {
      id: uuidv4(),
      name: item.name,
      description: item.description ?? "",
      quantity,
      unit_price,
      tax_rate,
      discount_percent: 0,
      subtotal,
      tax_amount,
      total: subtotal + tax_amount,
    };
  });
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── Tool executor ────────────────────────────────────────────────────────────

interface ToolContext {
  businessId: string;
}

async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  ctx: ToolContext
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getRawSupabase = async () => {
    const sb = await createClient();
    return sb as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  switch (name) {
    // ── Customers ────────────────────────────────────────────────────────────
    case "search_customers": {
      const sb = await getRawSupabase();
      const { data } = await sb
        .from("customers")
        .select("id, name, company, email, phone")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%,company.ilike.%${input.query}%`)
        .limit(8);
      return { customers: data ?? [], count: (data ?? []).length };
    }

    case "create_customer": {
      const c = await createCustomer({
        name: input.name,
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        tax_number: null,
        notes: null,
        archived: false,
      });
      return { id: c.id, name: c.name, email: c.email, message: `Customer "${c.name}" created` };
    }

    case "update_customer": {
      const { customer_id, ...fields } = input;
      await updateCustomer(customer_id, fields);
      return { message: "Customer updated" };
    }

    case "get_customer_details": {
      const sb = await getRawSupabase();
      const [customerRes, quotesRes, invoicesRes, workOrdersRes] = await Promise.all([
        sb.from("customers").select("*").eq("id", input.customer_id).eq("business_id", ctx.businessId).single(),
        sb.from("quotes").select("id, number, status, total, issue_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("invoices").select("id, number, status, total, due_date, amount_paid").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("work_orders").select("id, number, title, status, scheduled_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        customer: customerRes.data,
        recent_quotes: quotesRes.data ?? [],
        recent_invoices: invoicesRes.data ?? [],
        recent_work_orders: workOrdersRes.data ?? [],
      };
    }

    // ── Products ─────────────────────────────────────────────────────────────
    case "search_products": {
      const all = await getProducts(false);
      const q = (input.query ?? "").toLowerCase();
      const results = q
        ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
        : all;
      return { products: results.slice(0, 10), count: results.length };
    }

    case "create_product": {
      const p = await createProduct({
        name: input.name,
        description: input.description ?? null,
        unit_price: input.unit_price,
        tax_rate: input.tax_rate ?? 10,
        unit: input.unit ?? null,
        archived: false,
      } as Parameters<typeof createProduct>[0]);
      return { id: p.id, name: p.name, unit_price: p.unit_price, message: `Product "${p.name}" added to catalog` };
    }

    // ── Sites / Contacts / Billing Profiles ──────────────────────────────────
    case "search_sites": {
      const sb = await getRawSupabase();
      let q = sb.from("sites")
        .select("id, account_id, label, address, city, postcode")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .limit(8);
      if (input.account_id) q = q.eq("account_id", input.account_id);
      if (input.query) q = q.or(`label.ilike.%${input.query}%,address.ilike.%${input.query}%,city.ilike.%${input.query}%,postcode.ilike.%${input.query}%`);
      const { data } = await q;
      return { sites: data ?? [], count: (data ?? []).length };
    }

    case "create_site": {
      const s = await createSite(input.account_id, {
        label: input.label ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        access_notes: input.access_notes ?? null,
        gate_code: input.gate_code ?? null,
        parking_notes: input.parking_notes ?? null,
      });
      return { id: s.id, label: s.label, address: s.address, message: `Site "${s.label ?? s.address ?? "new"}" created` };
    }

    case "search_contacts": {
      const sb = await getRawSupabase();
      let q = sb.from("contacts")
        .select("id, account_id, name, email, phone, role")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .limit(8);
      if (input.account_id) q = q.eq("account_id", input.account_id);
      if (input.query) q = q.or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%,phone.ilike.%${input.query}%`);
      const { data } = await q;
      return { contacts: data ?? [], count: (data ?? []).length };
    }

    case "create_contact": {
      const c = await createContact(input.account_id, {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        role: input.role ?? "other",
        notes: input.notes ?? null,
      });
      return { id: c.id, name: c.name, role: c.role, message: `Contact "${c.name}" added` };
    }

    case "search_billing_profiles": {
      const sb = await getRawSupabase();
      let q = sb.from("billing_profiles")
        .select("id, account_id, name, email, is_default")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .limit(8);
      if (input.account_id) q = q.eq("account_id", input.account_id);
      if (input.query) q = q.or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%`);
      const { data } = await q;
      return { billing_profiles: data ?? [], count: (data ?? []).length };
    }

    case "create_billing_profile": {
      const bp = await createBillingProfile(input.account_id, {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        tax_number: input.tax_number ?? null,
        payment_terms: input.payment_terms ?? null,
        is_default: input.is_default ?? false,
      });
      return { id: bp.id, name: bp.name, message: `Billing profile "${bp.name}" created` };
    }

    case "update_billing_profile": {
      const { billing_profile_id, ...rest } = input;
      const bp = await updateBillingProfile(billing_profile_id, rest);
      return { id: bp.id, name: bp.name, message: `Billing profile "${bp.name}" updated` };
    }

    case "archive_billing_profile": {
      await archiveBillingProfile(input.billing_profile_id);
      return { message: "Billing profile archived" };
    }

    case "set_site_billing": {
      await setSiteBilling(input.site_id, input.billing_profile_id);
      return { message: "Site bill-to updated" };
    }

    // ── Workers ──────────────────────────────────────────────────────────────
    case "search_workers": {
      const sb = await getRawSupabase();
      let q = sb.from("member_profiles")
        .select("id, name, email, role_title")
        .eq("business_id", ctx.businessId)
        .eq("is_active", true)
        .order("name")
        .limit(10);
      if (input.query) q = q.or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%`);
      const { data } = await q;
      return { workers: data ?? [], count: (data ?? []).length };
    }

    // ── Date parsing ─────────────────────────────────────────────────────────
    case "parse_when": {
      const parsed = await parseWhen(input.text);
      return parsed;
    }

    // ── Work Orders ───────────────────────────────────────────────────────────
    case "create_work_order": {
      const wo = await createWorkOrder({
        title: input.title,
        description: input.description ?? undefined,
        reported_issue: input.reported_issue ?? null,
        customer_id: input.customer_id ?? null,
        site_id: input.site_id ?? null,
        booker_contact_id: input.booker_contact_id ?? null,
        onsite_contact_id: input.onsite_contact_id ?? null,
        billing_profile_id: input.billing_profile_id ?? null,
        property_address: input.property_address ?? undefined,
        scheduled_date: input.scheduled_date ?? null,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        member_profile_ids: input.member_profile_ids ?? [],
      });
      return { id: wo.id, number: wo.number, title: wo.title, message: `Work order ${wo.number} created` };
    }

    case "schedule_work_order": {
      await updateWorkOrder(input.work_order_id, {
        scheduled_date: input.scheduled_date ?? undefined,
        start_time: input.start_time ?? undefined,
        end_time: input.end_time ?? undefined,
      });
      return { message: "Work order scheduled" };
    }

    case "assign_workers_to_work_order": {
      await updateWorkOrder(input.work_order_id, {
        member_profile_ids: input.member_profile_ids,
      });
      return { message: `${input.member_profile_ids.length} worker(s) assigned` };
    }

    // ── Job Portfolio ────────────────────────────────────────────────────────
    case "list_job_photos": {
      const photos = await getJobPhotos(input.work_order_id);
      return { photos, by_phase: {
        before:    photos.filter((p) => p.phase === "before").length,
        during:    photos.filter((p) => p.phase === "during").length,
        after:     photos.filter((p) => p.phase === "after").length,
        reference: photos.filter((p) => p.phase === "reference").length,
      } };
    }

    case "tag_job_photo_phase": {
      const patch: Record<string, unknown> = {};
      if (input.phase) patch.phase = input.phase;
      if (input.caption !== undefined) patch.caption = input.caption;
      await updateJobPhoto(input.photo_id, patch as Parameters<typeof updateJobPhoto>[1]);
      return { message: "Photo updated" };
    }

    case "list_job_time_entries": {
      const entries = await getJobTimeEntries(input.work_order_id);
      const totalSec = entries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
      return { entries, total_hours: +(totalSec / 3600).toFixed(2) };
    }

    case "start_job_timer": {
      const e = await startTimeEntry({
        work_order_id: input.work_order_id,
        type: input.type,
        member_profile_id: input.member_profile_id ?? null,
        notes: input.notes ?? null,
      });
      return { entry_id: e.id, started_at: e.started_at, message: `${e.type} timer started` };
    }

    case "stop_job_timer": {
      const e = await stopTimeEntry(input.entry_id, input.notes);
      return { entry_id: e.id, duration_seconds: e.duration_seconds, message: `Timer stopped — ${Math.round((e.duration_seconds ?? 0) / 60)} min logged` };
    }

    case "log_time_block": {
      const e = await logTimeEntry({
        work_order_id: input.work_order_id,
        started_at: input.started_at,
        ended_at: input.ended_at,
        type: input.type,
        member_profile_id: input.member_profile_id ?? null,
        notes: input.notes ?? null,
      });
      return { entry_id: e.id, duration_seconds: e.duration_seconds, message: `${Math.round((e.duration_seconds ?? 0) / 60)} min logged` };
    }

    case "list_job_materials": {
      const materials = await getJobMaterials(input.work_order_id);
      return { materials, count: materials.length };
    }

    case "add_job_material": {
      const m = await addJobMaterial({
        work_order_id: input.work_order_id,
        name: input.name,
        qty: input.qty,
        unit: input.unit ?? null,
        unit_cost: input.unit_cost ?? null,
        unit_price: input.unit_price ?? null,
        product_id: input.product_id ?? null,
        billable: input.billable,
      });
      return { id: m.id, message: `Added ${m.qty} × ${m.name}` };
    }

    case "delete_job_material": {
      await deleteJobMaterial(input.material_id);
      return { message: "Material removed" };
    }

    case "list_job_documents": {
      const docs = await getJobDocuments(input.work_order_id);
      return { documents: docs, count: docs.length };
    }

    case "add_job_document": {
      const d = await addJobDocument({
        work_order_id: input.work_order_id,
        name: input.name,
        url: input.url,
        category: input.category,
        customer_visible: input.customer_visible,
      });
      return { id: d.id, message: `Document "${d.name}" attached` };
    }

    case "add_job_note": {
      await addJobNote(input.work_order_id, input.content, input.visible_to_customer ?? false);
      return { message: "Note added to job timeline" };
    }

    case "get_job_timeline": {
      const events = await getJobTimeline(input.work_order_id);
      return { events, count: events.length };
    }

    case "get_work_order_financials": {
      const f = await getWorkOrderFinancials(input.work_order_id);
      return f;
    }

    case "link_quote_to_work_order": {
      await linkFinancialToWorkOrder("quote", input.quote_id, input.work_order_id ?? null);
      return { message: input.work_order_id ? "Quote linked" : "Quote unlinked" };
    }

    case "link_invoice_to_work_order": {
      await linkFinancialToWorkOrder("invoice", input.invoice_id, input.work_order_id ?? null);
      return { message: input.work_order_id ? "Invoice linked" : "Invoice unlinked" };
    }

    case "enable_work_order_share_link": {
      const { token } = await enableWorkOrderShareLink(input.work_order_id);
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const url = base ? `${base}/jobs/${token}` : `/jobs/${token}`;
      return { token, url, message: `Share link enabled: ${url}` };
    }

    case "disable_work_order_share_link": {
      await disableWorkOrderShareLink(input.work_order_id);
      return { message: "Share link revoked" };
    }

    case "invoice_unbilled_work": {
      const res = await invoiceUnbilledForWorkOrder(input.work_order_id, {
        hourly_rate: input.hourly_rate,
        include_travel: input.include_travel,
        due_in_days: input.due_in_days,
      });
      return { ...res, message: `Draft invoice ${res.invoice_number} created — $${res.subtotal.toFixed(2)}` };
    }

    case "update_work_order_status": {
      await updateWorkOrderStatus(input.work_order_id, input.status);
      return { message: `Work order status updated to ${input.status}` };
    }

    case "list_work_orders": {
      const sb = await getRawSupabase();
      let q = sb
        .from("work_orders")
        .select("id, number, title, status, property_address, scheduled_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { work_orders: data ?? [], count: (data ?? []).length };
    }

    // ── Leads ─────────────────────────────────────────────────────────────────
    case "list_leads": {
      const leads = await getLeads(input.status ? { status: input.status } : undefined);
      return { leads, count: leads.length };
    }

    case "create_lead": {
      const lead = await createLead({
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        suburb: input.suburb ?? null,
        service: input.service ?? null,
        property_type: input.property_type ?? null,
        timing: input.timing ?? null,
        notes: input.notes ?? null,
        source: input.source ?? "manual",
      });
      return { lead_id: lead.id, message: `Lead "${lead.name}" captured` };
    }

    case "update_lead_status": {
      await updateLeadStatus(input.lead_id, input.status);
      return { message: `Lead status updated to ${input.status}` };
    }

    case "convert_lead_to_customer": {
      const res = await convertLeadToCustomer(input.lead_id);
      return { ...res, message: "Lead converted to customer" };
    }

    case "convert_lead_to_quote": {
      const res = await convertLeadToQuote(input.lead_id, {
        expiry_days: input.expiry_days,
        notes: input.notes,
      });
      return { ...res, message: `Draft quote ${res.quote_number} created from lead. Add line items via update_quote.` };
    }

    case "convert_lead_to_work_order": {
      const res = await convertLeadToWorkOrder(input.lead_id, {
        scheduled_date: input.scheduled_date ?? null,
        member_profile_ids: input.member_profile_ids,
      });
      return { ...res, message: `Work order ${res.work_order_number} created from lead` };
    }

    // ── Recurring jobs ────────────────────────────────────────────────────────
    case "list_recurring_jobs": {
      const items = await getRecurringJobs();
      return { recurring_jobs: items, count: items.length };
    }

    case "create_recurring_job": {
      const r = await createRecurringJob({
        name: input.name,
        title: input.title,
        description: input.description ?? null,
        customer_id: input.customer_id ?? null,
        site_id: input.site_id ?? null,
        property_address: input.property_address ?? null,
        member_profile_ids: input.member_profile_ids ?? [],
        cadence: input.cadence,
        preferred_weekday: input.preferred_weekday ?? null,
        preferred_day_of_month: input.preferred_day_of_month ?? null,
        preferred_start_time: input.preferred_start_time ?? null,
        preferred_duration_minutes: input.preferred_duration_minutes ?? null,
        next_occurrence_at: input.next_occurrence_at,
        ends_on: input.ends_on ?? null,
        generate_days_ahead: input.generate_days_ahead ?? 14,
      });
      return { recurring_job_id: r.id, message: `Recurring schedule "${r.name}" created — first occurrence ${r.next_occurrence_at}` };
    }

    case "pause_recurring_job": {
      await setRecurringJobActive(input.recurring_job_id, false);
      return { message: "Recurring schedule paused" };
    }

    case "resume_recurring_job": {
      await setRecurringJobActive(input.recurring_job_id, true);
      return { message: "Recurring schedule resumed" };
    }

    case "delete_recurring_job": {
      await deleteRecurringJob(input.recurring_job_id);
      return { message: "Recurring schedule deleted" };
    }

    // ── Quotes ────────────────────────────────────────────────────────────────
    case "create_quote": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const quote = await createQuote({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        expiry_date: addDays(input.expiry_days ?? 30),
        line_items: lineItems as unknown as LineItem[],
        subtotal,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        tax_total: taxTotal,
        total,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        invoice_id: null,
      });
      return { id: quote.id, number: quote.number, total, message: `Quote ${quote.number} created — $${total.toFixed(2)} total` };
    }

    case "list_quotes": {
      const sb = await getRawSupabase();
      let q = sb
        .from("quotes")
        .select("id, number, status, total, issue_date, expiry_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { quotes: data ?? [], count: (data ?? []).length };
    }

    case "send_quote_email": {
      await sendQuoteEmail(input.quote_id);
      return { message: "Quote emailed to customer" };
    }

    case "update_quote_status": {
      await updateQuote(input.quote_id, { status: input.status });
      return { message: `Quote marked as ${input.status}` };
    }

    case "convert_quote_to_invoice": {
      const invoice = await convertQuoteToInvoice(input.quote_id);
      return { id: invoice.id, number: invoice.number, message: `Invoice ${invoice.number} created from quote` };
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    case "create_invoice": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const invoice = await createInvoice({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        due_date: addDays(input.due_days ?? 30),
        line_items: lineItems as unknown as LineItem[],
        subtotal,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        tax_total: taxTotal,
        total,
        amount_paid: 0,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
      });
      return { id: invoice.id, number: invoice.number, total, message: `Invoice ${invoice.number} created — $${total.toFixed(2)} total` };
    }

    case "list_invoices": {
      const sb = await getRawSupabase();
      let q = sb
        .from("invoices")
        .select("id, number, status, total, due_date, amount_paid, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { invoices: data ?? [], count: (data ?? []).length };
    }

    case "send_invoice_email": {
      await sendInvoiceEmail(input.invoice_id);
      return { message: "Invoice emailed to customer" };
    }

    case "record_payment": {
      await addPayment(input.invoice_id, {
        amount: input.amount,
        date: input.date ?? new Date().toISOString().split("T")[0],
        method: input.method ?? null,
        reference: input.reference ?? null,
      });
      return { message: `Payment of $${input.amount} recorded` };
    }

    // ── Reports ───────────────────────────────────────────────────────────────
    case "create_report": {
      const report = await createReport({
        title: input.title,
        customer_id: input.customer_id ?? null,
        property_address: input.property_address ?? undefined,
        inspection_date: input.inspection_date ?? new Date().toISOString().split("T")[0],
        meta: {
          roof_type: input.roof_type ?? "",
          inspector_name: input.inspector_name ?? "",
        },
      });
      return { id: report.id, title: report.title, message: `Inspection report "${report.title}" created as draft` };
    }

    case "list_reports": {
      const sb = await getRawSupabase();
      let q = sb
        .from("reports")
        .select("id, title, status, property_address, inspection_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { reports: data ?? [], count: (data ?? []).length };
    }

    case "navigate_to":
      return { navigating: true, path: input.path };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(businessName: string): string {
  return `You are a powerful AI assistant built into ${businessName}'s business management app. You have full access to every feature of the system.

DOMAIN MODEL:
- Account = a customer (company or person). One account can have many Sites and many Contacts.
- Site = a physical property (address, gate code, parking notes).
- Contact = a person under an account (property manager, tenant, super, owner, billing).
- Billing profile = who pays. Can be set per account or per site.
- Work order = a job at a site, optionally assigned to one or more workers.
- Worker = a team member (member_profile) who does the on-site work.

CAPABILITIES — you can do all of these:
- Accounts/customers: search, create, update, view full history
- Sites (properties): search, create
- Contacts (people on an account): search, create
- Billing profiles: search, create, set per-site override
- Workers: search team members
- Product catalog: search (with stored prices), add new products
- Work orders: create with site/contacts/billing/workers, schedule, reassign, list, update status
- Quotes: create (using catalog prices), send by email, update status, convert to invoice, list
- Invoices: create, send by email, record payments, list
- Inspection reports: create draft reports, list reports
- Date parsing: turn "tomorrow at 2pm" / "next monday" into structured dates via parse_when

WORKFLOW RULES:
1. ALWAYS resolve names → IDs by searching first. e.g. user says "send Mike to the Smith St job tomorrow":
   → search_workers("Mike") → search_work_orders or search_sites("Smith St") → parse_when("tomorrow") → schedule_work_order + assign_workers_to_work_order.
2. Always search customers before creating to avoid duplicates.
3. For quotes/invoices: search the product catalog first; use stored prices when matches exist.
4. When creating a work order, prefer site_id over a free-text property_address — search_sites under the account first.
5. If a fuzzy date is given, call parse_when before passing scheduled_date.
6. If a search returns multiple candidates and the user's intent is ambiguous, ASK which one.
7. After creating any record, state its number (e.g. QT-0004, WO-0012).
8. Use navigate_to after creating important records so the user can open them.
9. Voice prompts are transcribed and may have slight errors — interpret intent generously.
10. Never say you "don't have access" — you can do everything listed above.

Today's date: ${new Date().toISOString().split("T")[0]}`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const businessId = await getActiveBizId(supabase, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (supabase as any).from("businesses").select("name").eq("id", businessId).single();

  const { messages } = await request.json() as { messages: Anthropic.MessageParam[] };
  const ctx: ToolContext = { businessId };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const allMessages = [...messages];
        let iterations = 0;

        while (iterations < 15) {
          iterations++;

          const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            system: buildSystemPrompt(business?.name ?? "your business"),
            tools: TOOLS,
            messages: allMessages,
          });

          const assistantContent = response.content;
          let hasToolUse = false;
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of assistantContent) {
            if (block.type === "text" && block.text) {
              send({ type: "text", content: block.text });
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              send({
                type: "tool_start",
                id: block.id,
                name: block.name,
                label: TOOL_LABELS[block.name] ?? block.name,
                input: block.input,
              });

              try {
                const result = await executeTool(block.name, block.input as Record<string, unknown>, ctx);

                if (block.name === "navigate_to") {
                  const inp = block.input as { path: string; label: string };
                  send({ type: "navigate", path: inp.path, label: inp.label });
                }

                send({ type: "tool_done", id: block.id, name: block.name, result });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err) {
                const error = err instanceof Error ? err.message : "Tool failed";
                send({ type: "tool_error", id: block.id, name: block.name, error });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Error: ${error}`,
                  is_error: true,
                });
              }
            }
          }

          allMessages.push({ role: "assistant", content: assistantContent });

          if (!hasToolUse || response.stop_reason === "end_turn") break;

          allMessages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
