/**
 * MCP tools for the Expenses & job-costing plugin. Scopes: expenses:read /
 * expenses:write. (Receipt uploads stay web-only — no binary over MCP.)
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

export function registerExpenseTools(tool: ToolFn): void {
  tool("list_expenses", "List expenses (optionally for one job), newest first.",
    { work_order_id: UUID.optional(), limit: z.number().int().min(1).max(500).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:read");
      let q = t(ctx, "expenses").select("id, spent_on, category, vendor, description, amount, tax_amount, billable, status, work_order_id")
        .eq("business_id", ctx.businessId).order("spent_on", { ascending: false }).limit(args.limit ?? 200);
      if (args.work_order_id) q = q.eq("work_order_id", args.work_order_id);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_expense", "Record an expense. Link it to a job with work_order_id for job costing; set billable to rebill the customer.",
    {
      amount: z.number(),
      category: z.string().optional(),
      vendor: z.string().optional(),
      description: z.string().optional(),
      tax_amount: z.number().optional(),
      spent_on: z.string().optional(),
      payment_method: z.string().optional(),
      work_order_id: UUID.optional(),
      billable: z.boolean().optional(),
      reimbursable: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { data, error } = await t(ctx, "expenses").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        amount: args.amount, tax_amount: args.tax_amount ?? 0,
        category: args.category?.trim() || "other", vendor: args.vendor?.trim() || null,
        description: args.description?.trim() || null,
        spent_on: args.spent_on || new Date().toISOString().split("T")[0],
        payment_method: args.payment_method?.trim() || null,
        work_order_id: args.work_order_id ?? null,
        billable: !!args.billable, reimbursable: !!args.reimbursable,
      }).select("id").single();
      if (error) throw error;
      return text({ created: true, expense_id: data.id });
    });

  tool("update_expense", "Update an expense (amount / category / vendor / billable / status / job link).",
    {
      expense_id: UUID,
      amount: z.number().optional(), tax_amount: z.number().optional(), category: z.string().optional(),
      vendor: z.string().optional(), description: z.string().optional(), spent_on: z.string().optional(),
      payment_method: z.string().optional(), work_order_id: UUID.nullable().optional(),
      billable: z.boolean().optional(), reimbursable: z.boolean().optional(),
      status: z.enum(["recorded", "reimbursed", "invoiced"]).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { expense_id, ...rest } = args;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "expenses").update(clean).eq("id", expense_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_expense", "Delete an expense.",
    { expense_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { error } = await t(ctx, "expenses").delete().eq("id", args.expense_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("get_job_costing", "Cost summary for a job: total expenses (+billable) plus labour/material context lives on the work order.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:read");
      const { data } = await t(ctx, "expenses").select("amount, tax_amount, billable, category")
        .eq("business_id", ctx.businessId).eq("work_order_id", args.work_order_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      const total = rows.reduce((s, e) => s + Number(e.amount) + Number(e.tax_amount), 0);
      const billable = rows.filter((e) => e.billable).reduce((s, e) => s + Number(e.amount) + Number(e.tax_amount), 0);
      return text({ work_order_id: args.work_order_id, expense_total: total, billable_total: billable, count: rows.length });
    });
}
