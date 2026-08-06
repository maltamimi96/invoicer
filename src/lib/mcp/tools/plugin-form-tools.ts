/**
 * MCP tools for the newer/most-churned domains — the plugin/module system,
 * industry presets, the Public Form Builder, Client Onboarding, and Contracts.
 * Peeled out of register-tools.ts so parallel work on these features edits a
 * focused file instead of the 2000-line monolith. Behaviour is identical: each
 * tool is registered through the same `tool()` helper and shares the same
 * context/scope plumbing.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { ctxFrom, appBase, UUID, getOrMintPortalToken, type ToolFn } from "./shared";
import { secureFieldsAvailable } from "@/lib/onboarding/crypto";

/**
 * A secure field is unusable without ONBOARDING_SECRET_KEY: the customer fills
 * the form, hits save, and gets an error they can do nothing about. The UI
 * builder already blocks adding one — these tools are the other way in, so
 * they have to block it too. Returns an error string, or null when fine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function secureFieldsBlocked(fields: any[] | undefined): string | null {
  if (!fields?.some((f) => f?.type === "secure")) return null;
  if (secureFieldsAvailable()) return null;
  return "Secure credential fields need ONBOARDING_SECRET_KEY (64 hex chars) set on the server. "
    + "Without it the customer could not submit the form. Set the key, or use a normal text field.";
}

export function registerPluginFormTools(tool: ToolFn): void {
  // ===== PLUGINS (module system — docs/SEO_AGENCY_PLAN.md P0) =====
  tool("list_plugins",
    "List Kirei's plugins (modules) and whether each is enabled for this business. Core plugins are always on. Disabling a plugin only hides it — no data is ever deleted.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { PLUGIN_REGISTRY, resolveEnabledPlugins } = await import("@/lib/plugins/registry");
      const [{ data: rows }, { data: qa }, { data: ob }, { data: fb }] = await Promise.all([
        t(ctx, "business_agent_installs").select("agent_id, enabled").eq("business_id", ctx.businessId),
        t(ctx, "quoting_agent_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
        t(ctx, "onboarding_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
        t(ctx, "form_builder_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
      ]);
      const enabled = resolveEnabledPlugins(rows ?? [], {
        quoting_agent_settings: qa ? !!qa.enabled : null,
        onboarding_settings: ob ? !!ob.enabled : null,
        form_builder_settings: fb ? !!fb.enabled : null,
      });
      return text(PLUGIN_REGISTRY.filter((p) => p.kind === "module").map((p) => ({
        id: p.id, name: p.name, category: p.category, core: !!p.core,
        enabled: enabled[p.id], dependencies: p.dependencies ?? [],
      })));
    });

  tool("set_plugin_enabled",
    "Enable or disable a plugin (module) for this business. Core plugins can't be disabled; plugins that other enabled plugins depend on are blocked. Disabling hides the module — data is preserved and re-enabling restores it.",
    { plugin_id: z.string().min(1), enabled: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { PLUGINS_BY_ID, resolveEnabledPlugins, dependentsOf } = await import("@/lib/plugins/registry");
      const plugin = PLUGINS_BY_ID[args.plugin_id];
      if (!plugin) return errorText(`Unknown plugin "${args.plugin_id}"`);
      if (plugin.core) return errorText(`"${plugin.name}" is a core module and can't be disabled`);

      if (!args.enabled) {
        // Block disabling something an enabled plugin depends on.
        const [{ data: rows }, { data: qa }, { data: ob }, { data: fb }] = await Promise.all([
          t(ctx, "business_agent_installs").select("agent_id, enabled").eq("business_id", ctx.businessId),
          t(ctx, "quoting_agent_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
          t(ctx, "onboarding_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
          t(ctx, "form_builder_settings").select("enabled").eq("business_id", ctx.businessId).maybeSingle(),
        ]);
        const enabled = resolveEnabledPlugins(rows ?? [], {
          quoting_agent_settings: qa ? !!qa.enabled : null,
          onboarding_settings: ob ? !!ob.enabled : null,
          form_builder_settings: fb ? !!fb.enabled : null,
        });
        const deps = dependentsOf(plugin.id, enabled);
        if (deps.length > 0) {
          return errorText(`Disable ${deps.map((d) => `"${d.name}"`).join(", ")} first — ${deps.length > 1 ? "they depend" : "it depends"} on "${plugin.name}".`);
        }
      }

      const { error } = await t(ctx, "business_agent_installs").upsert(
        { business_id: ctx.businessId, agent_id: plugin.id, enabled: args.enabled, updated_at: new Date().toISOString() },
        { onConflict: "business_id,agent_id" },
      );
      if (error) throw error;
      const { syncPluginSideEffects } = await import("@/lib/plugins/sync");
      await syncPluginSideEffects(ctx.sb, ctx.businessId, plugin.id, args.enabled);
      return text({ plugin: plugin.id, enabled: args.enabled });
    });

  tool("list_industry_presets", "List industry presets — plugin bundles + vocabulary a business can apply (trades, agency, …).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { INDUSTRY_PRESETS } = await import("@/lib/plugins/presets");
      return text(INDUSTRY_PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description, plugins: p.plugins, vocab: p.vocab ?? {} })));
    });

  tool("apply_industry_preset",
    "Apply an industry preset to this business: sets the plugin bundle (explicit enable/disable rows for every optional module) and its vocabulary. Data is never deleted — disabled modules are only hidden.",
    { preset_id: z.string().min(1) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { PRESETS_BY_ID, presetInstallRows } = await import("@/lib/plugins/presets");
      const { PLUGINS_BY_ID: byId } = await import("@/lib/plugins/registry");
      const { syncPluginSideEffects: syncFx } = await import("@/lib/plugins/sync");
      const preset = PRESETS_BY_ID[args.preset_id];
      if (!preset) return errorText(`Unknown preset "${args.preset_id}". Use list_industry_presets.`);
      const { error: bizErr } = await t(ctx, "businesses").update({ industry_preset: preset.id }).eq("id", ctx.businessId);
      if (bizErr) throw bizErr;
      const rows = presetInstallRows(ctx.businessId, preset);
      const { error } = await t(ctx, "business_agent_installs").upsert(rows, { onConflict: "business_id,agent_id" });
      if (error) throw error;
      for (const row of rows) {
        if (byId[row.agent_id]?.settingsTable) {
          await syncFx(ctx.sb, ctx.businessId, row.agent_id, row.enabled);
        }
      }
      return text({ applied: preset.id, enabled: preset.plugins, vocab: preset.vocab ?? {} });
    });

  // ===== PUBLIC FORM BUILDER (feature-flagged, lead-capture / embeddable) =====
  const FORM_FIELD = z.object({
    id: z.string().min(1),
    type: z.enum([
      "short_text", "long_text", "instructions", "email", "phone", "url", "address",
      "abn", "company", "dropdown", "multi_select", "radio", "checkboxes", "yes_no",
      "number", "currency", "date", "time", "opening_hours", "file", "image",
      "rating", "consent", "heading", "divider",
    ]),
    label: z.string(),
    help_text: z.string().optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    preset: z.string().optional(),
    validation: z.object({ pattern: z.string(), message: z.string() }).optional(),
    show_if: z.object({ field_id: z.string(), equals: z.string() }).nullable().optional(),
  });

  tool("set_form_builder_enabled", "Enable or disable the Public Form Builder plugin for this business.",
    { enabled: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:write");
      const { error } = await t(ctx, "form_builder_settings")
        .upsert({ business_id: ctx.businessId, enabled: args.enabled }, { onConflict: "business_id" });
      if (error) throw error;
      return text({ enabled: args.enabled });
    });

  tool("list_public_forms", "List public/embeddable forms with their status and public URL slug.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:read");
      const { data, error } = await t(ctx, "public_forms")
        .select("id, name, slug, status, created_at").eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return text((data ?? []).map((f: any) => ({ ...f, public_url: `${appBase()}/f/${f.slug}`, embed_url: `${appBase()}/embed/${f.slug}` })));
    });

  tool("get_public_form", "Get one public form including its full field schema and settings.",
    { form_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:read");
      const { data } = await t(ctx, "public_forms").select("*").eq("id", args.form_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Form not found");
      return text({ ...data, public_url: `${appBase()}/f/${data.slug}`, embed_url: `${appBase()}/embed/${data.slug}` });
    });

  tool("create_public_form",
    "Create a public/embeddable form (draft). fields is an ordered array (same field model as onboarding, minus secure). Set activate:true to publish immediately. create_lead (default true) makes each submission a lead in the sales pipeline.",
    { name: z.string().min(1), description: z.string().optional(), fields: z.array(FORM_FIELD).optional(), activate: z.boolean().optional(), create_lead: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:write");
      const base = args.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "form";
      let slug = base;
      for (let i = 1; i < 200; i++) {
        const { data: hit } = await t(ctx, "public_forms").select("id").eq("slug", slug).maybeSingle();
        if (!hit) break;
        slug = `${base}-${i + 1}`;
      }
      const { data, error } = await t(ctx, "public_forms").insert({
        business_id: ctx.businessId, name: args.name, description: args.description ?? null, slug,
        schema: args.fields ?? [], status: args.activate ? "published" : "draft",
        settings: { submit_text: "Submit", create_lead: args.create_lead ?? true },
        theme: { show_branding: true },
      }).select("id, name, slug, status").single();
      if (error) throw error;
      return text({ created: true, form: data, public_url: `${appBase()}/f/${slug}`, embed_url: `${appBase()}/embed/${slug}` });
    });

  tool("update_public_form", "Update a public form's name/description/status/fields.",
    {
      form_id: UUID, name: z.string().optional(), description: z.string().optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      fields: z.array(FORM_FIELD).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:write");
      const { form_id, fields, ...rest } = args;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clean: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (fields !== undefined) clean.schema = fields;
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "public_forms").update(clean).eq("id", form_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_public_form", "Delete a public form and all its submissions.",
    { form_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:write");
      const { error } = await t(ctx, "public_forms").delete().eq("id", args.form_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("list_form_submissions", "List submissions to a public form (newest first).",
    { form_id: UUID, limit: z.number().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "forms:read");
      const { data, error } = await t(ctx, "public_form_submissions")
        .select("id, answers, lead_id, created_at, leads(name)")
        .eq("business_id", ctx.businessId).eq("form_id", args.form_id)
        .order("created_at", { ascending: false }).limit(args.limit ?? 100);
      if (error) throw error;
      return text(data);
    });

  // ===== CLIENT ONBOARDING (feature-flagged form builder) =====
  const ONBOARDING_FIELD = z.object({
    id: z.string().min(1),
    type: z.enum([
      "short_text", "long_text", "instructions", "email", "phone", "url", "address",
      "abn", "company", "dropdown", "multi_select", "radio", "checkboxes", "yes_no",
      "number", "currency", "date", "time", "opening_hours", "file", "image",
      "rating", "secure", "consent", "heading", "divider",
    ]),
    label: z.string(),
    help_text: z.string().optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    show_if: z.object({ field_id: z.string(), equals: z.string() }).nullable().optional(),
    preset: z.string().optional().describe("Preset key enabling smart validation/links: instagram, tiktok, x_handle, abn, acn, website, facebook, linkedin, youtube, google_business, logo…"),
    validation: z.object({ pattern: z.string(), message: z.string() }).optional().describe("Custom regex validation applied on submit"),
  });

  tool("set_onboarding_enabled", "Enable or disable the Client Onboarding plugin for this business.",
    { enabled: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const { error } = await t(ctx, "onboarding_settings")
        .upsert({ business_id: ctx.businessId, enabled: args.enabled }, { onConflict: "business_id" });
      if (error) throw error;
      return text({ enabled: args.enabled });
    });

  tool("list_onboarding_forms", "List this business's client-onboarding forms.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:read");
      const { data, error } = await t(ctx, "onboarding_forms")
        .select("id, name, description, status, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("get_onboarding_form", "Get one onboarding form including its full field list (schema) — use before updating a form's fields.",
    { form_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:read");
      const { data } = await t(ctx, "onboarding_forms")
        .select("*").eq("id", args.form_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Form not found");
      return text(data);
    });

  tool("delete_onboarding_form", "Delete an onboarding form and all its requests/responses.",
    { form_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const { error } = await t(ctx, "onboarding_forms")
        .delete().eq("id", args.form_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("create_onboarding_form",
    "Create a client-onboarding form. fields is an ordered array; each field needs a unique id, a type (short_text/long_text/email/phone/url/address/abn/company/dropdown/multi_select/radio/checkboxes/yes_no/number/currency/date/time/opening_hours/file/image/rating/secure/consent/heading/divider/instructions) and a label. Use type 'secure' for credentials — those answers are encrypted and never readable via the API.",
    { name: z.string().min(1), description: z.string().optional(), fields: z.array(ONBOARDING_FIELD), activate: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const blocked = secureFieldsBlocked(args.fields);
      if (blocked) return errorText(blocked);
      const { data, error } = await t(ctx, "onboarding_forms").insert({
        business_id: ctx.businessId, name: args.name, description: args.description ?? null,
        schema: args.fields, status: args.activate ? "active" : "draft",
      }).select("id, name, status").single();
      if (error) throw error;
      return text({ created: true, form: data });
    });

  tool("update_onboarding_form", "Update an onboarding form's name/description/status/fields.",
    {
      form_id: UUID, name: z.string().optional(), description: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      fields: z.array(ONBOARDING_FIELD).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const { form_id, fields, ...rest } = args;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clean: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (fields !== undefined) clean.schema = fields;
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "onboarding_forms").update(clean).eq("id", form_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("send_onboarding_form", "Send an onboarding form to a customer — emails them a portal link and returns it.",
    { form_id: UUID, customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const [{ data: form }, { data: customer }, { data: biz }] = await Promise.all([
        t(ctx, "onboarding_forms").select("id, name, schema").eq("id", args.form_id).eq("business_id", ctx.businessId).maybeSingle(),
        t(ctx, "customers").select("id, name, email").eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle(),
        t(ctx, "businesses").select("name, email").eq("id", ctx.businessId).single(),
      ]);
      if (!form) return errorText("Form not found");
      if (!customer) return errorText("Customer not found");
      if (!customer.email) return errorText("Customer has no email address");
      if ((form.schema ?? []).length === 0) return errorText("Form has no fields yet");

      const { data: openReq } = await t(ctx, "onboarding_requests")
        .select("id").eq("business_id", ctx.businessId).eq("form_id", args.form_id)
        .eq("customer_id", args.customer_id).neq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      let requestId: string = openReq?.id ?? "";
      if (!requestId) {
        const { data: created, error } = await t(ctx, "onboarding_requests").insert({
          business_id: ctx.businessId, form_id: args.form_id, customer_id: args.customer_id,
        }).select("id").single();
        if (error) throw error;
        requestId = created.id;
      }
      const token = await getOrMintPortalToken(ctx, args.customer_id);
      const url = `${appBase()}/portal/${token}/onboarding/${requestId}`;
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px"><p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p><h1 style="font-size:20px;margin:0 0 12px">${form.name}</h1><p style="font-size:14px;line-height:1.6;color:#333">Hi ${customer.name ?? "there"}, please fill in a few details so we can get you set up.</p><p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Open the form</a></p><p style="font-size:12px;color:#888">${url}</p></div></body></html>`;
      await sendEmail({
        to: customer.email, subject: `${biz?.name ?? "Onboarding"}: ${form.name}`, html,
        from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "onboarding" }),
        replyTo: biz?.email ?? undefined,
        tags: { business_id: ctx.businessId, doc_type: "custom", doc_id: requestId },
      });
      return text({ sent: true, request_id: requestId, url });
    });

  tool("list_onboarding_requests", "List onboarding requests (optionally by form or customer) with status.",
    { form_id: UUID.optional(), customer_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:read");
      let q = t(ctx, "onboarding_requests")
        .select("id, form_id, customer_id, status, sent_at, completed_at, customers(name), onboarding_forms(name)")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(100);
      if (args.form_id) q = q.eq("form_id", args.form_id);
      if (args.customer_id) q = q.eq("customer_id", args.customer_id);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("delete_onboarding_request", "Delete a sent onboarding request (and any answers submitted to it).",
    { request_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const { error } = await t(ctx, "onboarding_requests")
        .delete().eq("id", args.request_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("get_onboarding_response",
    "Get a customer's submitted onboarding answers. Secure (credential) fields are ALWAYS redacted here — they can only be revealed by an owner/admin in the web app.",
    { request_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:read");
      const { data } = await t(ctx, "onboarding_responses")
        .select("*").eq("request_id", args.request_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("No response yet for this request");
      const { redactSecureAnswers } = await import("@/lib/onboarding/answers");
      return text({
        ...data,
        answers: redactSecureAnswers(data.schema_snapshot ?? [], data.answers ?? {}),
      });
    });

  // ===== CONTRACTS =====
  tool("list_contracts", "List customer contracts (status: draft/sent/viewed/signed/declined/voided).",
    { status: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:read");
      let q = t(ctx, "contracts").select("id, title, kind, status, customer_id, signer_email, sent_at, signed_at, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(100);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_contract", "Get a contract including its content.",
    { contract_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:read");
      const { data } = await t(ctx, "contracts").select("*, customers(name, email)").eq("id", args.contract_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Contract not found");
      return text(data);
    });

  tool("create_contract", "Create a rich-text contract for a customer (draft). content_html may use merge fields: {{customer_name}}, {{business_name}}, {{date}}, etc. Send it for signature separately once Dropbox Sign is configured.",
    { customer_id: UUID, title: z.string().min(1), content_html: z.string().min(1) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { data, error } = await t(ctx, "contracts").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: args.customer_id,
        title: args.title, kind: "rich_text", content_html: args.content_html, status: "draft",
      }).select().single();
      if (error) throw error;
      return text({ created: true, contract: data });
    });

  tool("update_contract", "Update a draft contract's title/content.",
    { contract_id: UUID, title: z.string().optional(), content_html: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { contract_id, ...rest } = args;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data: c } = await t(ctx, "contracts").select("status").eq("id", contract_id).eq("business_id", ctx.businessId).maybeSingle();
      if (c && c.status !== "draft") return errorText("Only draft contracts can be edited");
      const { data, error } = await t(ctx, "contracts").update(clean).eq("id", contract_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, contract: data });
    });

  tool("void_contract", "Void a contract (no longer valid / not to be signed).",
    { contract_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { error } = await t(ctx, "contracts").update({ status: "voided" }).eq("id", args.contract_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ voided: true });
    });

  tool("delete_contract", "Delete a contract.",
    { contract_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { error } = await t(ctx, "contracts").delete().eq("id", args.contract_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("send_contract", "Email a contract to its customer for in-app e-signature; returns the signing link and flips it to sent.",
    { contract_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { data: c } = await t(ctx, "contracts")
        .select("id, status, customer_id, title, customers(name, email)")
        .eq("id", args.contract_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!c) return errorText("Contract not found");
      if (c.status === "signed") return errorText("Already signed");
      if (c.status === "voided") return errorText("Contract is voided");
      if (!c.customer_id) return errorText("Contract has no customer");
      const email = c.customers?.email as string | undefined;
      const signer = (c.customers?.name as string | undefined) ?? "Customer";
      if (!email) return errorText("Customer has no email address");

      const token = await getOrMintPortalToken(ctx, c.customer_id);
      const url = `${appBase()}/portal/${token}/contract/${c.id}`;
      const { data: biz } = await t(ctx, "businesses").select("name, email").eq("id", ctx.businessId).single();
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px"><p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p><h1 style="font-size:20px;margin:0 0 12px">Please sign: ${c.title}</h1><p style="font-size:14px;line-height:1.6;color:#333">Hi ${signer}, you have a contract ready to sign.</p><p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Review &amp; sign</a></p><p style="font-size:12px;color:#888">${url}</p></div></body></html>`;
      await sendEmail({
        to: email, subject: `${biz?.name ?? "Contract"}: please sign “${c.title}”`, html,
        from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "contracts" }),
        replyTo: biz?.email ?? undefined,
        tags: { business_id: ctx.businessId, doc_type: "custom", doc_id: c.id },
      });
      await t(ctx, "contracts").update({
        status: "sent", provider: "native", signer_name: signer, signer_email: email, sent_at: new Date().toISOString(),
      }).eq("id", c.id).eq("business_id", ctx.businessId);
      return text({ sent: true, sign_url: url });
    });

  tool("list_contract_templates", "List reusable contract templates.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:read");
      const { data, error } = await t(ctx, "contract_templates").select("id, name, created_at").eq("business_id", ctx.businessId).order("name");
      if (error) throw error;
      return text(data);
    });

  tool("create_contract_template", "Create a reusable contract template (content_html may use merge fields).",
    { name: z.string().min(1), content_html: z.string().min(1) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "contracts:write");
      const { data, error } = await t(ctx, "contract_templates").insert({
        business_id: ctx.businessId, name: args.name, content_html: args.content_html,
      }).select().single();
      if (error) throw error;
      return text({ created: true, template: data });
    });

  // ===== CLIENT FIELDS (industry-preset profile fields + their answers) =====

  tool("get_client_fields",
    "Get the extra fields this business records about a client, beyond name and contact details. Unset means the industry preset's defaults are in use.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { resolveCustomerFields, isUsingPresetDefaults } = await import("@/lib/customers/field-schema");
      const { resolveAccountTypes, isUsingPresetAccountTypes } = await import("@/lib/customers/account-types");
      const { data } = await t(ctx, "businesses")
        .select("customer_field_schema, customer_type_options, industry_preset")
        .eq("id", ctx.businessId).maybeSingle();
      return text({
        fields: resolveCustomerFields(data?.customer_field_schema, data?.industry_preset),
        using_preset_defaults: isUsingPresetDefaults(data?.customer_field_schema),
        industry_preset: data?.industry_preset ?? null,
        client_types: resolveAccountTypes(data?.customer_type_options, data?.industry_preset),
        using_preset_client_types: isUsingPresetAccountTypes(data?.customer_type_options),
      });
    });

  tool("set_client_fields",
    "Replace the extra fields recorded about a client. An empty list is valid and means none. Credential ('secure') fields are refused — a client profile is visible to anyone who can see the client, so put those on an onboarding form instead.",
    { fields: z.array(ONBOARDING_FIELD) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const seen = new Set<string>();
      for (const f of args.fields) {
        if (f.type === "secure") return errorText(`"${f.label}" is a credential field — those belong on an onboarding form, not a client profile.`);
        if (f.type === "file" || f.type === "image") return errorText(`"${f.label}" is an upload field — client profiles don't take uploads. Use an onboarding form, or the client's Files tab.`);
        if (seen.has(f.id)) return errorText(`Two fields share the id "${f.id}" — one answer would overwrite the other.`);
        seen.add(f.id);
      }
      if (args.fields.length > 60) return errorText("More than 60 fields — split them across an onboarding form instead.");
      const { error } = await t(ctx, "businesses")
        .update({ customer_field_schema: args.fields }).eq("id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true, count: args.fields.length });
    });

  tool("set_client_types",
    "Replace the client TYPE options — the dropdown at the top of every client form (Residential/Strata for trades, Retainer client/Project client for an agency). Keep at least one: every client is saved with one.",
    { types: z.array(z.object({ value: z.string().min(1), label: z.string().min(1), hint: z.string().optional() })) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { validateAccountTypes } = await import("@/lib/customers/account-types");
      const problem = validateAccountTypes(args.types);
      if (problem) return errorText(problem);
      const { error } = await t(ctx, "businesses")
        .update({ customer_type_options: args.types }).eq("id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true, count: args.types.length });
    });

  tool("reset_client_fields",
    "Drop this business's custom client fields AND client types, going back to its industry preset's defaults. Answers already saved on clients stay in the database but stop being shown.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { error } = await t(ctx, "businesses")
        .update({ customer_field_schema: null, customer_type_options: null }).eq("id", ctx.businessId);
      if (error) throw error;
      return text({ reset: true });
    });

  tool("set_client_field_values",
    "Set a client's answers to the business's client fields. Merges with what's already there; answers to fields that no longer exist are dropped.",
    { customer_id: UUID, values: z.record(z.string(), z.unknown()) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { resolveCustomerFields, pruneAnswers } = await import("@/lib/customers/field-schema");
      const [{ data: biz }, { data: customer }] = await Promise.all([
        t(ctx, "businesses").select("customer_field_schema, industry_preset").eq("id", ctx.businessId).maybeSingle(),
        t(ctx, "customers").select("id, custom_fields").eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle(),
      ]);
      if (!customer) return errorText("Customer not found");
      const fields = resolveCustomerFields(biz?.customer_field_schema, biz?.industry_preset);
      const merged = pruneAnswers({ ...(customer.custom_fields ?? {}), ...args.values }, fields);
      const { error } = await t(ctx, "customers")
        .update({ custom_fields: merged }).eq("id", args.customer_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true, values: merged });
    });

  tool("fill_onboarding_form",
    "Fill in an onboarding form on a customer's behalf, for details you already have — records it as completed without sending them anything. Uploads can only come from the customer through their own link; credential fields work only when the server has an encryption key. Answering something that can't be stored is an error, not a silent drop.",
    { form_id: UUID, customer_id: UUID, answers: z.record(z.string(), z.unknown()) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "onboarding:write");
      const { stripUnfillableAnswers, staffFillProblems, staffFillErrorMessage, staffOnlyCustomerFields } =
        await import("@/lib/onboarding/staff-fill");
      const { processAnswersForStorage } = await import("@/lib/onboarding/answers");
      const { secureFieldsAvailable } = await import("@/lib/onboarding/crypto");

      const [{ data: form }, { data: customer }] = await Promise.all([
        t(ctx, "onboarding_forms").select("id, schema").eq("id", args.form_id).eq("business_id", ctx.businessId).maybeSingle(),
        t(ctx, "customers").select("id").eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle(),
      ]);
      if (!form) return errorText("Form not found");
      if (!customer) return errorText("Customer not found");
      const schema = form.schema ?? [];
      if (schema.length === 0) return errorText("That form has no fields yet");

      // Credentials only when there's a key to encrypt them with.
      const opts = { allowSecure: secureFieldsAvailable() };
      const { clean } = stripUnfillableAnswers(schema, args.answers, opts);
      const problems = staffFillProblems(schema, args.answers, opts);
      if (problems.length) return errorText(staffFillErrorMessage(problems));
      const stored = processAnswersForStorage(schema, clean);

      const { data: openReq } = await t(ctx, "onboarding_requests")
        .select("id").eq("business_id", ctx.businessId).eq("form_id", args.form_id)
        .eq("customer_id", args.customer_id).neq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const now = new Date().toISOString();
      let requestId: string = openReq?.id ?? "";
      if (requestId) {
        const { error } = await t(ctx, "onboarding_requests")
          .update({ status: "completed", completed_at: now }).eq("id", requestId).eq("business_id", ctx.businessId);
        if (error) throw error;
      } else {
        const { data: created, error } = await t(ctx, "onboarding_requests").insert({
          business_id: ctx.businessId, form_id: args.form_id, customer_id: args.customer_id,
          status: "completed", completed_at: now,
        }).select("id").single();
        if (error) throw error;
        requestId = created.id;
      }
      const { error: respErr } = await t(ctx, "onboarding_responses").upsert({
        business_id: ctx.businessId, request_id: requestId, form_id: args.form_id,
        customer_id: args.customer_id, answers: stored, schema_snapshot: schema,
        draft: false, submitted_at: now,
      }, { onConflict: "request_id" });
      if (respErr) throw respErr;

      return text({
        saved: true, request_id: requestId,
        answered: Object.keys(clean).length,
        still_needs_customer: staffOnlyCustomerFields(schema, opts).map((f) => f.label),
      });
    });
}
