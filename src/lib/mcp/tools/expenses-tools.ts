/**
 * MCP tools for the Expenses & job-costing plugin. Scopes: expenses:read /
 * expenses:write. (Receipt uploads stay web-only — no binary over MCP.)
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { nextDueDate, validateSchedule, type ExpenseCadence } from "@/lib/recurring/expense-schedule";

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
  tool("get_books_summary",
    "The books for a period: money in (payments received), money out (expenses), profit or loss, the GST position, and breakdowns by category and supplier. Cash basis. Periods are day/week/month/quarter/fy — quarters and financial years follow the Australian July-June calendar, so they line up with BAS and tax.",
    {
      period: z.enum(["day", "week", "month", "quarter", "fy", "all"]).optional(),
      offset: z.number().int().min(-60).max(0).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:read");
      const { buildPeriod, monthsBetween, todayStr } = await import("@/lib/expenses/period");
      const period = buildPeriod(args.period ?? "month", todayStr(), args.offset ?? 0);

      const [exp, pay] = await Promise.all([
        t(ctx, "expenses").select("amount, tax_amount, category, vendor, billable, spent_on")
          .eq("business_id", ctx.businessId).gte("spent_on", period.start).lte("spent_on", period.end).limit(5000),
        t(ctx, "payments").select("amount, date")
          .eq("business_id", ctx.businessId).gte("date", period.start).lte("date", period.end).limit(5000),
      ]);
      const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (exp.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pays = (pay.data ?? []) as any[];
      const gross = (e: { amount: unknown; tax_amount: unknown }) => n(e.amount) + n(e.tax_amount);
      const outTotal = rows.reduce((s2, e) => s2 + gross(e), 0);
      const income = pays.reduce((s2, p2) => s2 + n(p2.amount), 0);
      const byCat = new Map<string, number>();
      for (const e of rows) byCat.set(e.category, (byCat.get(e.category) ?? 0) + gross(e));

      return text({
        period: { label: period.label, start: period.start, end: period.end },
        income, expenses: outTotal, net: income - outTotal,
        gst_collected_estimate: income / 11,
        gst_paid: rows.reduce((s2, e) => s2 + n(e.tax_amount), 0),
        expense_count: rows.length,
        by_category: [...byCat.entries()].map(([category, total]) => ({ category, total }))
          .sort((a, b) => b.total - a.total),
        note: "Cash basis. GST collected is estimated as 1/11th of payments received.",
      });
    });
}

// ── Recurring costs ─────────────────────────────────────────────────────────
// Rent, insurance, subscriptions. The cron posts them; these tools let the
// assistant set one up ("add our $180/mo insurance") and see what's committed.

const CADENCE = z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]);

export function registerRecurringExpenseTools(tool: ToolFn): void {
  tool("list_recurring_expenses", "List recurring costs (rent, insurance, subscriptions) and when each next falls due.",
    { include_inactive: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:read");
      let q = t(ctx, "recurring_expenses")
        .select("id, name, vendor, category, amount, tax_amount, cadence, preferred_day_of_month, next_run_on, ends_on, active, last_run_at")
        .eq("business_id", ctx.businessId).order("next_run_on", { ascending: true }).limit(500);
      if (!args.include_inactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_recurring_expense", "Schedule a recurring cost. It posts an expense automatically on each due date.",
    {
      name: z.string(),
      amount: z.number(),
      cadence: CADENCE,
      next_run_on: z.string().describe("YYYY-MM-DD — when it next falls due"),
      category: z.string().optional(),
      vendor: z.string().optional(),
      description: z.string().optional(),
      tax_amount: z.number().optional(),
      payment_method: z.string().optional(),
      preferred_day_of_month: z.number().int().min(1).max(31).optional()
        .describe("For monthly and longer. 31 lands on the last day of a short month."),
      ends_on: z.string().optional(),
      billable: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const problem = validateSchedule(args);
      if (problem) return errorText(problem);
      const { data, error } = await t(ctx, "recurring_expenses").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name.trim(), vendor: args.vendor?.trim() || null,
        category: args.category?.trim() || "other",
        description: args.description?.trim() || null,
        amount: args.amount, tax_amount: args.tax_amount ?? 0,
        payment_method: args.payment_method?.trim() || null,
        billable: args.billable ?? false,
        cadence: args.cadence, preferred_day_of_month: args.preferred_day_of_month ?? null,
        next_run_on: args.next_run_on, ends_on: args.ends_on || null, active: true,
      }).select("id, name, next_run_on").single();
      if (error) throw error;
      return text(data);
    });

  tool("update_recurring_expense", "Change a recurring cost — amount, cadence, next due date, or pause it.",
    {
      id: UUID,
      name: z.string().optional(),
      amount: z.number().optional(),
      tax_amount: z.number().optional(),
      category: z.string().optional(),
      vendor: z.string().optional(),
      cadence: CADENCE.optional(),
      preferred_day_of_month: z.number().int().min(1).max(31).nullable().optional(),
      next_run_on: z.string().optional(),
      ends_on: z.string().nullable().optional(),
      active: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { id, ...rest } = args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) return errorText("Nothing to change.");
      const { data, error } = await t(ctx, "recurring_expenses")
        .update(patch).eq("id", id).eq("business_id", ctx.businessId)
        .select("id, name, amount, cadence, next_run_on, active").single();
      if (error) throw error;
      return text(data);
    });

  tool("delete_recurring_expense", "Stop a recurring cost. Costs it already posted stay in the books.",
    { id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { error } = await t(ctx, "recurring_expenses")
        .delete().eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true, id: args.id });
    });

  tool("run_recurring_expense_now", "Post this recurring cost's next occurrence immediately, without waiting for the daily run.",
    { id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "expenses:write");
      const { data: sch, error: readErr } = await t(ctx, "recurring_expenses")
        .select("*").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
      if (readErr) throw readErr;
      if (!sch) return errorText("No such recurring cost.");

      const spentOn = String(sch.next_run_on);
      const { error: insErr } = await t(ctx, "expenses").insert({
        business_id: ctx.businessId, user_id: ctx.userId, recurring_expense_id: sch.id,
        vendor: sch.vendor, category: sch.category,
        description: sch.description ?? sch.name,
        amount: sch.amount, tax_amount: sch.tax_amount, spent_on: spentOn,
        payment_method: sch.payment_method, billable: sch.billable, status: "recorded",
      });
      // The unique index is the guard against double-posting a cost.
      if (insErr) {
        if ((insErr as { code?: string }).code === "23505") return errorText("That occurrence has already been posted.");
        throw insErr;
      }

      const next = nextDueDate(spentOn, sch.cadence as ExpenseCadence, sch.preferred_day_of_month);
      await t(ctx, "recurring_expenses")
        .update({ next_run_on: next, last_run_at: new Date().toISOString() })
        .eq("id", args.id).eq("business_id", ctx.businessId);
      return text({ ok: true, posted_on: spentOn, next_run_on: next });
    });
}
