/**
 * MCP tools for the password vault.
 *
 * ⚠️ **There is deliberately no `reveal` tool, and there never should be.**
 *
 * Every other feature in Kirei gets full MCP parity — that's a standing rule.
 * This is the one exception, and it's a considered one rather than an
 * oversight: revealing a stored credential puts a client's password into a
 * model context, a conversation transcript and an `assistant_messages` row,
 * where it is no longer covered by the encryption or the audit log that
 * justify storing it at all. Reading a password is a deliberate human act at a
 * screen; `revealVaultSecret` (a cookie-authed server action) is the only path.
 *
 * What these tools do give you: finding and organising entries by voice or
 * chat, which is the actual daily need ("what logins do we hold for Acme?").
 *
 * Writing IS allowed — saving a credential someone hands you is useful and
 * one-directional. The value goes in encrypted and cannot come back out here.
 *
 * The `vault:*` scopes are excluded from the assistant's automatic role
 * expansion (src/lib/assistant/scopes.ts), so only an owner/admin — or an API
 * key granted them on purpose — reaches these at all.
 */
import { z } from "zod";
import { assertScope, t, text } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import { validateVaultItem, normaliseUrl, VAULT_CATEGORIES } from "@/lib/vault/items";

const CATEGORIES = VAULT_CATEGORIES.map((c) => c.value);

export function registerVaultTools(tool: ToolFn): void {
  tool("list_vault_items",
    "List password-vault entries: what accounts you hold credentials for, optionally filtered to one client. Returns titles, usernames and URLs — NEVER the passwords, which can only be revealed in the app.",
    {
      customer_id: UUID.optional().describe("Only entries for this client"),
      search: z.string().optional().describe("Match against the title or username"),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "vault:read");
      let q = t(ctx, "vault_items")
        .select("id, title, category, username, url, customer_id, password_enc, notes_enc, updated_at, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (args.customer_id) q = q.eq("customer_id", args.customer_id);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const term = (args.search ?? "").trim().toLowerCase();
      // Filtered here rather than with .or(): PostgREST's or-grammar shatters
      // on a comma or a dot in the term, and this list is capped at 200 rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = ((data ?? []) as any[]).filter((r) =>
        !term
        || (r.title ?? "").toLowerCase().includes(term)
        || (r.username ?? "").toLowerCase().includes(term));

      return text(rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        username: r.username,
        url: r.url,
        client: r.customers?.name ?? null,
        customer_id: r.customer_id,
        // Booleans, never the stored value. Do not be tempted to widen this.
        has_password: Boolean(r.password_enc),
        has_notes: Boolean(r.notes_enc),
        updated_at: r.updated_at,
      })));
    });

  tool("create_vault_item",
    "Save a credential to the password vault. The password is encrypted immediately and can never be read back through this API — only in the app, by an owner or admin, with the access logged.",
    {
      title: z.string().describe('What the account is, e.g. "Acme — Meta Business Manager"'),
      password: z.string().optional().describe("Stored encrypted. Cannot be retrieved through MCP."),
      username: z.string().optional(),
      url: z.string().optional(),
      notes: z.string().optional().describe("Recovery codes / security answers. Also encrypted."),
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      customer_id: UUID.optional().describe("The client this login belongs to"),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "vault:write");
      if (!encryptionAvailable()) {
        throw new Error("The vault needs APP_ENCRYPTION_KEY (64 hex chars) set on the server before it can store anything.");
      }
      const problem = validateVaultItem(
        { title: args.title, url: args.url, password: args.password, notes: args.notes },
        { isNew: true },
      );
      if (problem) throw new Error(problem);

      const { data, error } = await t(ctx, "vault_items").insert({
        business_id: ctx.businessId,
        title: args.title.trim(),
        category: args.category ?? "other",
        username: args.username?.trim() || null,
        url: normaliseUrl(args.url),
        customer_id: args.customer_id ?? null,
        password_enc: args.password?.trim() ? encryptSecret(args.password) : null,
        notes_enc: args.notes?.trim() ? encryptSecret(args.notes) : null,
      }).select("id").single();
      if (error) throw new Error(error.message);

      await t(ctx, "vault_access_log").insert({
        business_id: ctx.businessId, item_id: data.id, item_title: args.title.trim(),
        // No cookie session here, so no user id — the log says it came from the
        // API rather than pretending a person did it.
        user_email: "(API / assistant)", action: "create",
      });
      return text({ ok: true, id: data.id });
    });

  tool("update_vault_item",
    "Change a vault entry. Omit `password` to leave the stored one untouched — passing an empty string does NOT clear it.",
    {
      id: UUID,
      title: z.string().optional(),
      username: z.string().optional(),
      url: z.string().optional(),
      password: z.string().optional().describe("Replaces the stored password. Omit to keep it."),
      notes: z.string().optional(),
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      customer_id: UUID.optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "vault:write");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {};
      if (args.title !== undefined) patch.title = args.title.trim();
      if (args.username !== undefined) patch.username = args.username.trim() || null;
      if (args.url !== undefined) patch.url = normaliseUrl(args.url);
      if (args.category !== undefined) patch.category = args.category;
      if (args.customer_id !== undefined) patch.customer_id = args.customer_id;
      if (args.password?.trim()) {
        if (!encryptionAvailable()) throw new Error("The vault needs APP_ENCRYPTION_KEY set on the server.");
        patch.password_enc = encryptSecret(args.password);
      }
      if (args.notes?.trim()) {
        if (!encryptionAvailable()) throw new Error("The vault needs APP_ENCRYPTION_KEY set on the server.");
        patch.notes_enc = encryptSecret(args.notes);
      }
      if (Object.keys(patch).length === 0) throw new Error("Nothing to change");

      const { error } = await t(ctx, "vault_items")
        .update(patch).eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw new Error(error.message);

      await t(ctx, "vault_access_log").insert({
        business_id: ctx.businessId, item_id: args.id, item_title: patch.title ?? null,
        user_email: "(API / assistant)", action: "update",
      });
      return text({ ok: true });
    });

  tool("delete_vault_item", "Permanently delete a vault entry. The audit log entry survives.",
    { id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "vault:write");
      const { data: existing } = await t(ctx, "vault_items")
        .select("title").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
      const { error } = await t(ctx, "vault_items")
        .delete().eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw new Error(error.message);

      await t(ctx, "vault_access_log").insert({
        business_id: ctx.businessId, item_id: null, item_title: existing?.title ?? null,
        user_email: "(API / assistant)", action: "delete",
      });
      return text({ ok: true });
    });

  tool("list_vault_access_log",
    "Who opened, added or removed vault entries, newest first. Use to answer 'who had that password'.",
    { limit: z.number().int().min(1).max(500).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "vault:read");
      const { data, error } = await t(ctx, "vault_access_log")
        .select("id, item_title, user_email, action, created_at")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 100);
      if (error) throw new Error(error.message);
      return text(data ?? []);
    });
}
