/**
 * MCP tools for payment details held on file.
 *
 * ⚠️ **There is deliberately no `reveal` tool, and there never should be.**
 *
 * Same exception, same reasoning, as the password vault: revealing a stored
 * account number would put it into a model context, a conversation transcript
 * and an `assistant_messages` row — outside the encryption and the audit log
 * that justify storing it at all. Reading one is a deliberate human act at a
 * screen; `revealPaymentDetail` (a cookie-authed server action, owner/admin
 * only, logged) is the only path.
 *
 * What these give you is the daily question — "do we have bank details for
 * Acme?" — answerable by chat, with the number itself never leaving the
 * database.
 *
 * Writing IS allowed: recording details someone reads to you is useful and
 * one-directional. The value goes in encrypted and cannot come back out here.
 *
 * 🔴 No card numbers. `validatePaymentDetail` Luhn-checks what's passed and
 * rejects a PAN, and the DB CHECK permits no card kind — so this route is no
 * softer than the form.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import {
  validatePaymentDetail, maskAccount, kindDef, PAYMENT_KINDS,
} from "@/lib/payments/details";

const KIND = z.enum(["bank_au", "bank_intl", "payid", "bpay", "other"]);

export function registerPaymentDetailTools(tool: ToolFn): void {
  tool("list_payment_details",
    "Payment details held on file for a customer — MASKED. Shows which accounts exist and their last four digits; the full number is never returned here.",
    { customer_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payment_details:read");
      let q = t(ctx, "customer_payment_details")
        .select("id, customer_id, kind, label, holder_name, bank_name, hint, notes, is_default, created_at, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false }).limit(200);
      if (args.customer_id) q = q.eq("customer_id", args.customer_id);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("list_payment_detail_kinds",
    "The kinds of payment detail that can be stored, and what each one's fields mean. Card numbers are not among them and cannot be stored.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payment_details:read");
      return text(PAYMENT_KINDS);
    });

  tool("create_payment_detail",
    "Store bank/transfer details for a customer, for manual payment. Encrypted at rest. NEVER pass a card number — it will be rejected.",
    {
      customer_id: UUID,
      kind: KIND.optional(),
      account: z.string().describe("Account number, IBAN, PayID or reference"),
      routing: z.string().optional().describe("BSB, sort code, SWIFT or biller code"),
      label: z.string().optional(),
      holder_name: z.string().optional(),
      bank_name: z.string().optional(),
      notes: z.string().optional(),
      is_default: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payment_details:write");
      if (!encryptionAvailable()) {
        return errorText("APP_ENCRYPTION_KEY isn't set on this server, so payment details can't be stored safely.");
      }
      const problem = validatePaymentDetail(args);
      if (problem) return errorText(problem);

      const kind = args.kind ?? "bank_au";
      const account = args.account.trim();
      const routing = (args.routing ?? "").trim();

      const { data, error } = await t(ctx, "customer_payment_details").insert({
        business_id: ctx.businessId,
        customer_id: args.customer_id,
        kind,
        label: args.label?.trim() || kindDef(kind).label,
        holder_name: args.holder_name?.trim() || null,
        bank_name: args.bank_name?.trim() || null,
        notes: args.notes?.trim() || null,
        is_default: args.is_default ?? false,
        account_enc: encryptSecret(account),
        routing_enc: routing ? encryptSecret(routing) : null,
        hint: maskAccount(account),
        created_by: ctx.userId ?? null,
      }).select("id, kind, label, hint").single();
      if (error) throw error;

      await t(ctx, "payment_detail_access_log").insert({
        business_id: ctx.businessId, detail_id: data.id, detail_label: data.label,
        customer_id: args.customer_id, user_id: ctx.userId ?? null, action: "create (mcp)",
      });
      return text(data);
    });

  tool("delete_payment_detail", "Remove a stored payment detail.",
    { id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payment_details:write");
      const { data: row } = await t(ctx, "customer_payment_details")
        .select("label, customer_id").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
      const { error } = await t(ctx, "customer_payment_details")
        .delete().eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw error;
      await t(ctx, "payment_detail_access_log").insert({
        business_id: ctx.businessId, detail_id: null, detail_label: row?.label ?? null,
        customer_id: row?.customer_id ?? null, user_id: ctx.userId ?? null, action: "delete (mcp)",
      });
      return text({ deleted: true });
    });
}
