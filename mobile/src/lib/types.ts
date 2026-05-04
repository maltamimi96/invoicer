// Lightweight mirror of the relevant tables; keep in sync with src/types/database.ts in the web app.

export type WorkOrderStatus =
  | "draft"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "completed"
  | "cancelled";

export type WorkOrder = {
  id: string;
  business_id: string;
  number: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  customer_id: string | null;
  property_address: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  reported_issue: string | null;
  assigned_to_profile_id: string | null;
  assigned_to_email: string | null;
  photos: WorkOrderPhoto[] | null;
  worker_notes: string | null;
  completed_at: string | null;
  created_at: string;
  /** Per-account contact links — fetched separately and joined on detail. */
  booker_contact_id?: string | null;
  onsite_contact_id?: string | null;
};

export type AccountContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
};

export type Task = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "normal" | "high" | "urgent";
  assignee_user_id: string | null;
  due_date: string | null;
  related_work_order_id: string | null;
  related_customer_id: string | null;
  tags: string[];
  position: number;
  created_at: string;
};

export type WorkOrderPhoto = {
  url: string;
  caption?: string;
  taken_at?: string;
};

export type WorkOrderWithCustomer = WorkOrder & {
  customers: { id: string; name: string; company: string | null; email: string | null; phone?: string | null } | null;
};

export type Business = {
  id: string;
  name: string;
  logo_url: string | null;
};
