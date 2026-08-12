/**
 * The Kirei assistant.
 *
 * Replaces /api/agent's hand-rolled loop. Three things are different, and each
 * fixes a specific defect in the old one:
 *
 *  1. **Memory.** The wire format is Anthropic.MessageParam[] with content
 *     blocks preserved, and the route returns the updated history for the
 *     client to send back. The old panel typed content as a plain string and
 *     kept only the final text, so every tool_use/tool_result block was thrown
 *     away between turns — the agent could not remember an ID it had just
 *     looked up. This is the contract CLAUDE.md documents for the mobile agent.
 *
 *  2. **Tools.** It reads the shared registry (lib/mcp/collect.ts) — the same
 *     ~196 tools /api/mcp exposes — instead of a hand-maintained 79 that drift.
 *
 *  3. **Truth about stopping.** Tools run only on stop_reason === "tool_use";
 *     truncation, refusal and the iteration cap are reported rather than
 *     silently swallowed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId, userBelongsToBusiness } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { getMyRoleCached } from "@/lib/role";
import { ANTHROPIC_TOOLS } from "@/lib/mcp/anthropic-tools";
import { invokeTool } from "@/lib/mcp/invoke";
import { assistantScopesForRole } from "@/lib/assistant/scopes";
import {
  resolveModel,
  resolveEffort,
  modelSupportsThinking,
  modelSupportsEffort,
} from "@/lib/assistant/models";
import { dispatchToolWebhook } from "@/lib/assistant/tool-webhooks";
import { undoSpecFor, targetIdFor, snapshotRow, buildChangeEntry } from "@/lib/assistant/undo";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";
import type { AgentContextPacket } from "@/lib/actions/agent-context";
import type { AssistantChangeEntry } from "@/types/database";

const anthropic = new Anthropic();

/** Each iteration is a model round-trip plus its tool calls. Without this the
 *  platform default applies and the function dies mid-chain. */
export const maxDuration = 300;

const MAX_ITERATIONS = 15;

/** 4096 (the old value) truncates real tool chains — which is how truncated
 *  tool calls reached live write actions in the first place. */
const MAX_TOKENS = 16000;

// ── system prompt ────────────────────────────────────────────────────────────

/**
 * The stable half of the prompt. Everything here is byte-identical across
 * turns and across users of the same business, so it can carry the cache
 * breakpoint. Anything volatile (the live snapshot, today's date) goes in the
 * conversation instead — putting it here would invalidate the cached prefix on
 * every single turn.
 */
function stableSystemPrompt(businessName: string): string {
  return `You are the AI assistant inside Kirei, the field-services and CRM app ${businessName} runs their business on.

You have real tools covering the whole app — customers, sites, contacts, leads,
quotes, invoices, payments, work orders, scheduling, products, tasks, team,
expenses, inventory, timesheets, assets, prospects, forms, contracts and SEO.
Use them. Never claim you can't do something that a tool covers.

You can see images. The user can attach photos or shoot one on their phone, and
you can pull a work order's own photos with view_job_photos (use list_job_photos
first to see how many there are, and filter by phase — before/during/after —
rather than fetching everything). Read what's actually in the picture: damage,
a meter reading, a handwritten note, a receipt, a serial number. If a photo is
too dark or blurry to judge, say so rather than guessing.

How to work:
- Search before you create. Duplicate customers are a real and costly problem.
- When the user says "this invoice", "that customer", "today's jobs" — resolve
  it from the conversation and the context snapshot rather than asking.
- You can see what you did earlier in this conversation, including every tool
  call and its result. If you already have an ID, use it; don't search again.
- Prefer one clear action over a long plan. Do the thing, then say what you did.
- Some requests are read-only ("how many overdue invoices?"). Answer those
  directly — don't mutate anything you weren't asked to.
- Before anything destructive or irreversible (deleting records, sending email
  to a customer, charging a card), make sure that is actually what was asked.
- Voice input is transcribed and may contain small errors. Read for intent, but
  if a misheard word would change *what gets deleted or sent*, ask first.
- Report honestly. If a tool failed, say so and what you'll do about it. Never
  claim something was done when it wasn't.

Answer in plain prose. Lead with the outcome — what happened or what you found —
then any detail that changes what the user would do next.`;
}

/** Render the live snapshot. Volatile, so it never touches the cached prefix. */
function renderContext(ctx: AgentContextPacket | null): string {
  if (!ctx) return "";
  const lines: string[] = [];
  const money = (n: number) => `${ctx.business.currency ?? "$"}${Number(n ?? 0).toFixed(2)}`;

  lines.push(`Current page: ${ctx.current_page}`);
  lines.push(
    `Stats: ${money(ctx.stats.outstanding)} outstanding, ${money(ctx.stats.overdue)} overdue, ` +
      `${ctx.stats.jobs_today} jobs today, ${ctx.stats.jobs_this_week} this week, ` +
      `${ctx.stats.draft_quotes} draft quotes, ${ctx.stats.new_leads_7d} new leads (7d).`
  );

  const section = <T,>(title: string, rows: T[], fmt: (r: T) => string) => {
    if (!rows?.length) return;
    lines.push(`\n${title}:`);
    for (const r of rows) lines.push(`  ${fmt(r)}`);
  };

  section(
    "Recent customers",
    ctx.recent_customers,
    (c) => `${c.name}${c.company ? ` (${c.company})` : ""} — id ${c.id}`
  );
  section(
    "Recent invoices",
    ctx.recent_invoices,
    (i) =>
      `${i.number} — ${i.customer_name ?? "no customer"} — ${i.status} — ` +
      `${money(i.total)} (balance ${money(i.balance)}) — id ${i.id}`
  );
  section(
    "Recent quotes",
    ctx.recent_quotes,
    (q) => `${q.number} — ${q.customer_name ?? "no customer"} — ${q.status} — ${money(q.total)} — id ${q.id}`
  );
  section(
    "Today's jobs",
    ctx.todays_jobs,
    (j) => `${j.number} — ${j.title} — ${j.status} — ${j.customer_name ?? "no customer"} — id ${j.id}`
  );
  section("Open leads", ctx.open_leads, (l) => `${l.name} — ${l.status} — id ${l.id}`);

  return lines.join("\n");
}

// ── route ────────────────────────────────────────────────────────────────────

interface AssistantRequest {
  messages: Anthropic.MessageParam[];
  context?: AgentContextPacket | null;
  model?: string;
  effort?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let user: Awaited<ReturnType<typeof getUser>>;
  try {
    user = await getUser();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = await getActiveBizId(supabase, user.id);

  // That business id came from a cookie, and on this route the tools run as
  // service-role — so RLS, which everywhere else makes a tampered cookie
  // harmless, is not going to catch it. Without this check any signed-in user
  // could point active_business_id at another tenant's UUID, resolve to a role
  // (see the fail-closed fallback in lib/role.ts), and have the tools read that
  // tenant's customers, invoices and leads straight past RLS.
  if (!(await userBelongsToBusiness(supabase, user.id, businessId))) {
    return Response.json({ error: "Business not found" }, { status: 403 });
  }

  // The tools run as service-role, bypassing RLS — so the caller's role, not
  // the database, decides what they can reach here. See lib/assistant/scopes.
  const role = await getMyRoleCached();
  const scopes = assistantScopesForRole(role);
  if (!scopes) {
    return Response.json(
      { error: "The assistant isn't available for your access level." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as AssistantRequest;
  const model = resolveModel(body.model);
  const effort = resolveEffort(body.effort);
  const snapshot = body.context ?? null;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  // Say plainly when the environment can't run the assistant, rather than
  // throwing somewhere downstream and surfacing as an opaque 500.
  //
  // Both of these are Production-only on Vercel today, so every preview
  // deployment hits this. The service-role key matters as much as the API key:
  // the shared tool registry runs entirely through the admin client, so without
  // it there is no assistant, just a chatbot that can't touch anything.
  const missing = [
    !process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY",
    !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    return Response.json(
      {
        error:
          `The assistant isn't configured in this environment — ${missing.join(" and ")} ` +
          `${missing.length > 1 ? "are" : "is"} missing. On Vercel these are set for Production only; ` +
          `add them to Preview to use the assistant here.`,
      },
      { status: 503 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (supabase as any)
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const invokeCtx = { businessId, userId: user.id, scopes };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: object) => controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));

      // Local working copy. Returned to the client at the end so the next turn
      // carries the full block history — the whole point of this route.
      const messages: Anthropic.MessageParam[] = [...body.messages];

      // Reversible mutations this turn made, in order. Persisted with the
      // assistant message so an Undo button can replay them backwards.
      const changeLog: AssistantChangeEntry[] = [];

      try {
        // Snapshots read through the admin client, same as the tools themselves —
        // the caller was already authorised by role above.
        //
        // Inside the try, deliberately: createClient() throws outright when the
        // service-role key is absent ("supabaseKey is required"), and out here
        // that throw escaped start(), took down the whole ReadableStream, and
        // surfaced as a bare 500 with no explanation. Anything that can throw
        // belongs where the catch can turn it into a message.
        const admin = createAdminClient();

        // Caching is a prefix match, so ordering is load-bearing. Render order
        // is tools -> system -> messages. The breakpoint sits on the *first*
        // system block, which caches the ~196 tool schemas plus the stable
        // prompt — by far the largest fixed cost. The live snapshot and today's
        // date change every turn, so they go in a second system block *after*
        // the breakpoint, where they cost nothing to re-send and cannot
        // invalidate what precedes them.
        const contextText = renderContext(snapshot);
        const system: Anthropic.TextBlockParam[] = [
          {
            type: "text",
            text: stableSystemPrompt(business?.name ?? "your business"),
            cache_control: { type: "ephemeral" },
          },
        ];
        if (contextText) {
          system.push({
            type: "text",
            text:
              `Live data for ${business?.name ?? "this business"}, as of ` +
              `${new Date().toISOString().split("T")[0]}. Prefer these IDs over searching again.\n\n${contextText}`,
          });
        }

        // Capabilities differ per model and an unsupported one is a hard 400,
        // not a no-op — Haiku 4.5 rejects both adaptive thinking and effort.
        // Build these conditionally rather than sending them blanket.
        //
        // budget_tokens and temperature stay out entirely: both are 400s on the
        // thinking-capable models here. Don't reintroduce them for Haiku either
        // — it's the fast option, and thinking defeats the point.
        const thinkingParam = modelSupportsThinking(model)
          ? ({ type: "adaptive" } as const)
          : undefined;
        const outputConfig = modelSupportsEffort(model) ? { effort } : undefined;

        for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
          const response = await anthropic.messages
            .stream({
              model,
              max_tokens: MAX_TOKENS,
              system,
              tools: ANTHROPIC_TOOLS,
              ...(thinkingParam ? { thinking: thinkingParam } : {}),
              ...(outputConfig ? { output_config: outputConfig } : {}),
              messages,
              // Second breakpoint, auto-placed on the last message block, so a
              // growing conversation reuses its own prefix turn over turn
              // instead of re-reading the whole history at full price.
              cache_control: { type: "ephemeral" },
            })
            .on("text", (delta) => send({ type: "text", content: delta }))
            .on("thinking", (delta) => send({ type: "thinking", content: delta }));

          const message = await response.finalMessage();

          // Only run tools when the model actually finished asking for them: a
          // reply cut off at max_tokens can end inside a tool_use block with
          // partial JSON, and these tools write to real records.
          const canRunTools = message.stop_reason === "tool_use";

          if (!canRunTools) {
            // Drop unanswered tool_use blocks before persisting: the client
            // sends this history back, and a tool_use with no tool_result is a
            // 400 that would wedge the conversation for good.
            const keep = message.content.filter((b) => b.type !== "tool_use");
            if (keep.length > 0) messages.push({ role: "assistant", content: keep });

            if (message.stop_reason === "max_tokens") {
              send({
                type: "error",
                message:
                  "That reply was cut off because it hit the length limit. Nothing was run — try a narrower request.",
              });
            } else if (message.stop_reason === "refusal") {
              send({ type: "error", message: "I can't help with that request." });
            }
            break;
          }

          messages.push({ role: "assistant", content: message.content });

          const toolUses = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          for (const block of toolUses) {
            send({ type: "tool_start", id: block.id, name: block.name, input: block.input });
          }

          // Claude emits parallel tool_use blocks readily; the old loop awaited
          // them one at a time. All results must come back in a single user
          // message or the model learns to stop calling tools in parallel.
          const results = await Promise.all(
            toolUses.map(async (block) => {
              const args = (block.input ?? {}) as Record<string, unknown>;

              // Snapshot before the tool runs, so a destructive call is
              // reversible. Nothing the old agent did was ever logged: it
              // could hard-delete a customer with no record and no undo.
              const spec = undoSpecFor(block.name);
              const targetId = spec ? targetIdFor(spec, args) : null;
              const before =
                spec && targetId ? await snapshotRow(admin, spec.table, targetId, businessId) : null;

              const outcome = await invokeTool(block.name, args, invokeCtx);

              if (!outcome.isError) {
                dispatchToolWebhook(block.name, businessId, args, outcome.text);

                if (spec && targetId && before) {
                  const after =
                    spec.op === "update"
                      ? await snapshotRow(admin, spec.table, targetId, businessId)
                      : null;
                  const entry = buildChangeEntry(block.name, spec, before, after, uuidv4());
                  if (entry) changeLog.push(entry);
                }
              }

              send({
                type: outcome.isError ? "tool_error" : "tool_done",
                id: block.id,
                name: block.name,
                result: outcome.text,
              });

              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                // Blocks, not outcome.text: tools like view_job_photos return
                // the actual images, and flattening to a string would leave the
                // assistant unable to see a work order's photos at all.
                content: outcome.content,
                ...(outcome.isError ? { is_error: true } : {}),
              };
            })
          );

          messages.push({ role: "user", content: results });

          if (iteration === MAX_ITERATIONS) {
            // Previously this exited silently: every tool card green, no text,
            // indistinguishable from a hang.
            send({
              type: "error",
              message:
                "I ran out of steps on this one. The actions above did run — ask me to continue if there's more to do.",
            });
          }
        }

        // The updated history is the payload that fixes cross-turn memory.
        send({ type: "done", messages, changeLog });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        console.error("[assistant]", msg);
        send({ type: "error", message: msg });
        // Still hand back history, so a mid-turn failure doesn't silently
        // desync the client's copy from what actually ran.
        send({ type: "done", messages, changeLog });
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
