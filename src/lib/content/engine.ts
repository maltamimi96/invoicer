/**
 * The Content Studio pipeline engine.
 *
 * The engine owns every write — callers persist nothing.
 *
 * Four things here are deliberately unlike src/lib/seo/engine.ts, each fixing
 * something that bit it:
 *
 *  1. **Retries.** SEO treats any throw as terminal (engine.ts:351), so one
 *     transient 529 kills a whole run permanently. Here failures are classified
 *     and retryable ones back off.
 *  2. **Forced tool-use** instead of hunting for `[` … `]` in prose.
 *  3. **A real cost model.** SEO bills Opus at Sonnet rates (~5x under), so its
 *     budget cap doesn't hold.
 *  4. **The brand is loaded and passed in.** SEO's voice agent aligns to a voice
 *     nothing ever told it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "@/lib/ai/models";
import { CONTENT_PROMPTS } from "./agent-prompts.generated";
import { CONTENT_AGENTS_BY_ID, executableSteps, type ContentAgentDef, type ContentKind } from "./pipeline";
import { AGENT_SCHEMAS } from "./schemas";
import type { ContentBrand } from "@/types/database";

const anthropic = new Anthropic();

/**
 * Real per-model rates (cents per 1k tokens), so the budget cap means
 * something. SEO applies one Sonnet-ish rate to every call including Opus.
 */
const RATES: Record<string, { in: number; out: number }> = {
  [AI_MODELS.smart]: { in: 0.5, out: 2.5 }, // Opus 4.8 — $5/$25 per M
  [AI_MODELS.balanced]: { in: 0.3, out: 1.5 }, // Sonnet 5 — $3/$15 per M
  [AI_MODELS.fast]: { in: 0.1, out: 0.5 }, // Haiku 4.5 — $1/$5 per M
};

function modelFor(agent: ContentAgentDef): string {
  return agent.model === "opus" ? AI_MODELS.smart : AI_MODELS.balanced;
}

function costCents(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const r = RATES[model] ?? RATES[AI_MODELS.balanced];
  return Math.ceil((usage.input_tokens / 1000) * r.in + (usage.output_tokens / 1000) * r.out);
}

/**
 * Is this worth retrying?
 *
 * Overload, rate limits and network blips are transient — the SEO engine dies
 * on them anyway. A 400 or an auth failure will fail identically forever, so
 * retrying just burns the budget.
 */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return /overloaded|timeout|timed out|econnreset|etimedout|fetch failed|socket hang up/.test(msg);
}

/** Exponential backoff with a ceiling. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
}

// ── budget ───────────────────────────────────────────────────────────────────

/**
 * Month-to-date spend vs the cap. 0 = unlimited.
 *
 * Unlike SEO, every call is attributed to a job row, so nothing escapes this.
 * (SEO's audits write their cost to events, not a job — invisible to its cap.)
 */
export async function spendStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string
): Promise<{ spentCents: number; budgetCents: number; ok: boolean }> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: jobs }, { data: biz }] = await Promise.all([
    sb.from("content_jobs").select("cost_cents").eq("business_id", businessId).gte("created_at", monthStart.toISOString()),
    sb.from("businesses").select("content_monthly_budget_cents").eq("id", businessId).single(),
  ]);

  const spentCents = (jobs ?? []).reduce((n: number, j: { cost_cents: number }) => n + (j.cost_cents ?? 0), 0);
  const budgetCents = biz?.content_monthly_budget_cents ?? 2000;
  return { spentCents, budgetCents, ok: budgetCents === 0 || spentCents < budgetCents };
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ── events ───────────────────────────────────────────────────────────────────

export async function logEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  row: {
    business_id: string;
    brand_id?: string | null;
    job_id?: string | null;
    agent_id?: string | null;
    level?: "info" | "success" | "error";
    message: string;
    cost_cents?: number;
  }
): Promise<void> {
  // Swallow: logging must never be the reason a run fails.
  try {
    await sb.from("content_job_events").insert({ level: "info", cost_cents: 0, ...row });
  } catch {
    /* ignore */
  }
}

// ── the brand block ──────────────────────────────────────────────────────────

/**
 * Render the brand for the model.
 *
 * This is the difference between content and *their* content, and it's what the
 * SEO plugin never does — its brand table has zero readers.
 */
export function renderBrand(brand: ContentBrand): string {
  const lines = [`Brand: ${brand.name}`];
  if (brand.industry) lines.push(`Trade: ${brand.industry}`);
  if (brand.services.length) lines.push(`Services they actually sell: ${brand.services.join(", ")}`);
  if (brand.service_area) lines.push(`Service area: ${brand.service_area}`);
  if (brand.audience) lines.push(`Audience: ${brand.audience}`);
  if (brand.voice) lines.push(`\nHow they talk:\n${brand.voice}`);
  if (brand.tone) lines.push(`Tone: ${brand.tone}`);
  if (brand.proof_points) {
    lines.push(
      `\nWhat they can honestly claim (nothing beyond this):\n${brand.proof_points}`
    );
  } else {
    lines.push(
      `\nNo proof points on file — so make NO claims about licensing, insurance, warranties or guarantees.`
    );
  }
  if (brand.banned_phrases.length) {
    lines.push(`\nPhrases they refuse to use — never emit these:\n- ${brand.banned_phrases.join("\n- ")}`);
  }
  if (brand.examples) lines.push(`\nTheir own posts that worked (match this register):\n${brand.examples}`);
  return lines.join("\n");
}

// ── running one agent ────────────────────────────────────────────────────────

export interface AgentResult {
  /** The tool payload — already schema-validated by the API. */
  data: Record<string, unknown>;
  costCents: number;
}

/**
 * Run one agent and get structured output back.
 *
 * Forces the agent's single tool, so the payload arrives validated rather than
 * scraped out of prose.
 */
export async function runAgent(agentId: string, userContent: string): Promise<AgentResult> {
  const agent = CONTENT_AGENTS_BY_ID[agentId];
  if (!agent) throw new Error(`Unknown agent "${agentId}"`);

  const system = CONTENT_PROMPTS[agentId];
  if (!system) throw new Error(`No prompt for agent "${agentId}"`);

  const schema = AGENT_SCHEMAS[agentId];
  if (!schema) throw new Error(`No output schema for agent "${agentId}"`);

  const model = modelFor(agent);

  const tools: Anthropic.Tool[] = [
    {
      name: schema.toolName,
      description: schema.description,
      input_schema: schema.input_schema as Anthropic.Tool.InputSchema,
    },
  ];
  // Web search is a server tool and can't coexist with a forced tool_choice —
  // the model must be free to search first, then submit. So searching agents
  // get the tool and a strong instruction instead of a hard force.
  if (agent.tools.includes("web_search")) {
    tools.unshift({ type: "web_search_20260209", name: "web_search", max_uses: 8 } as unknown as Anthropic.Tool);
  }

  const res = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system,
    tools,
    ...(agent.tools.includes("web_search")
      ? {}
      : { tool_choice: { type: "tool" as const, name: schema.toolName } }),
    messages: [{ role: "user", content: userContent }],
  });

  const cents = costCents(model, {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
  });

  const call = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === schema.toolName
  );
  if (!call) {
    // Only reachable for the search-enabled agents, which aren't force-called.
    throw new Error(
      `${agent.name} finished without submitting its result (stop_reason: ${res.stop_reason}).`
    );
  }

  return { data: call.input as Record<string, unknown>, costCents: cents };
}

// ── the topic scout ──────────────────────────────────────────────────────────

export interface ScoutTopic {
  title: string;
  detail?: string;
  angle_hint?: string;
  season?: string;
  source_urls?: string[];
  priority?: number;
}

/**
 * Clamp and sanitise what the model returned before it touches the DB.
 * Lifted from the SEO scout (engine.ts:191-198) — genuinely good defensive
 * work, and the one part of that function worth keeping wholesale.
 */
export function sanitiseTopics(raw: unknown, businessId: string, brandId: string) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((t): t is ScoutTopic => !!t && typeof (t as ScoutTopic).title === "string")
    .slice(0, 25)
    .map((t) => ({
      business_id: businessId,
      brand_id: brandId,
      title: String(t.title).slice(0, 300),
      detail: t.detail ? String(t.detail).slice(0, 2000) : null,
      angle_hint: t.angle_hint ? String(t.angle_hint).slice(0, 500) : null,
      season: t.season ? String(t.season).slice(0, 60) : null,
      source_urls: Array.isArray(t.source_urls)
        ? t.source_urls.filter((u) => typeof u === "string").slice(0, 8)
        : [],
      priority: Math.max(0, Math.min(10, Number(t.priority) || 5)),
      status: "queued" as const,
    }));
}

/** Research a brand's niche and queue topics. Standalone — not part of a chain. */
export async function runTopicScout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  args: { businessId: string; brandId: string }
): Promise<{ inserted: number; costCents: number }> {
  const { data: brand } = await sb
    .from("content_brands")
    .select("*")
    .eq("id", args.brandId)
    .eq("business_id", args.businessId)
    .single();
  if (!brand) throw new Error("Brand not found");

  const spend = await spendStatus(sb, args.businessId);
  if (!spend.ok) {
    throw new Error(
      `This month's content budget (${money(spend.budgetCents)}) is used up. Raise it to run the scout.`
    );
  }

  await logEvent(sb, {
    business_id: args.businessId,
    brand_id: args.brandId,
    agent_id: "topic-scout",
    message: `▶ Topic Scout — researching ${brand.industry ?? "the niche"}`,
  });

  const today = new Date().toISOString().split("T")[0];
  const { data, costCents } = await runAgent(
    "topic-scout",
    `${renderBrand(brand as ContentBrand)}\n\nToday's date: ${today}. Seasonality matters — anchor to this.\n\n` +
      `Research this business's niche and market, then call submit_topics with what you found.`
  );

  const rows = sanitiseTopics((data as { topics?: unknown }).topics, args.businessId, args.brandId);
  if (rows.length === 0) {
    await logEvent(sb, {
      business_id: args.businessId,
      brand_id: args.brandId,
      agent_id: "topic-scout",
      level: "error",
      message: "The scout came back with nothing usable — try again.",
      cost_cents: costCents,
    });
    throw new Error("The scout didn't return usable topics — try again.");
  }

  const { error } = await sb.from("content_topics").insert(rows);
  if (error) throw new Error(error.message);

  await logEvent(sb, {
    business_id: args.businessId,
    brand_id: args.brandId,
    agent_id: "topic-scout",
    level: "success",
    message: `✓ Topic Scout → ${rows.length} topics · ${money(costCents)}`,
    cost_cents: costCents,
  });

  return { inserted: rows.length, costCents };
}

// ── the chain ────────────────────────────────────────────────────────────────

interface PieceRow {
  id: string;
  business_id: string;
  brand_id: string;
  topic: string;
  kind: ContentKind;
  platforms: string[];
  angle_count: number;
  artifacts: Record<string, { content: string; created_at: string }>;
  publish_on: string | null;
}

interface JobRow {
  id: string;
  business_id: string;
  brand_id: string | null;
  step: number;
  input: { content_piece_id?: string };
  cost_cents: number;
  attempts: number;
}

/** Assemble the agent's input from the brand + the artifacts it consumes. */
function buildInput(agent: ContentAgentDef, piece: PieceRow, brand: ContentBrand): string {
  const parts = [
    renderBrand(brand),
    `\nTopic: ${piece.topic}`,
    `Deliverable: ${piece.kind}`,
    `Angles wanted: ${piece.angle_count}`,
  ];
  if (piece.platforms.length) parts.push(`Platforms: ${piece.platforms.join(", ")}`);

  for (const key of agent.consumes) {
    const art = piece.artifacts?.[key];
    if (art?.content) parts.push(`\n## Input — ${key}\n${art.content}`);
  }

  parts.push(`\nDo your part now and call ${AGENT_SCHEMAS[agent.id].toolName}.`);
  return parts.join("\n");
}

/** Fan the adapt/edit output out into content_variations rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeVariations(sb: any, piece: PieceRow, raw: unknown): Promise<number> {
  const list = Array.isArray(raw) ? raw : [];

  // A campaign-planned piece carries its intended date; the variations inherit
  // it so a planned run lands on the calendar without anyone scheduling a dozen
  // cards by hand. 09:00 local-ish is a placeholder the user can drag later.
  const scheduledAt = piece.publish_on ? `${piece.publish_on}T09:00:00Z` : null;

  const rows = list
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .filter((v) => typeof v.platform === "string" && piece.platforms.includes(v.platform as string))
    .map((v) => ({
      business_id: piece.business_id,
      piece_id: piece.id,
      angle_index: Math.max(0, Number(v.angle_index) || 0),
      angle: String(v.angle ?? "").slice(0, 200) || "Untitled angle",
      platform: String(v.platform),
      hook: v.hook ? String(v.hook).slice(0, 500) : null,
      body: v.body ? String(v.body).slice(0, 20000) : null,
      assets: (v.assets as Record<string, unknown>) ?? {},
      status: "draft" as const,
      // Only when planned. Both the adapt AND edit steps upsert these rows, so
      // writing `scheduled_at: null` here would have the edit step wipe a date
      // the user set by hand a minute earlier.
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }));

  if (rows.length === 0) return 0;

  // Upsert: the edit step re-emits the same (piece, angle, platform) rows with
  // corrections, and the unique index turns that into an update rather than a
  // duplicate.
  const { error } = await sb
    .from("content_variations")
    .upsert(rows, { onConflict: "piece_id,angle_index,platform" });
  if (error) throw new Error(error.message);
  return rows.length;
}

/**
 * Advance one job by exactly one step.
 *
 * One step per cron tick — the same trick the SEO engine uses to stay inside
 * the serverless timeout, and the right one.
 */
export async function advanceContentJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  job: JobRow
): Promise<{ status: string; stage?: string }> {
  const pieceId = job.input?.content_piece_id;
  if (!pieceId) throw new Error("Job has no content_piece_id");

  const { data: piece } = await sb.from("content_pieces").select("*").eq("id", pieceId).single();
  if (!piece) throw new Error("Piece not found");

  const { data: brand } = await sb.from("content_brands").select("*").eq("id", piece.brand_id).single();
  if (!brand) throw new Error("Brand not found");

  const steps = executableSteps(piece.kind as ContentKind);

  // Done.
  if (job.step >= steps.length) {
    await sb.from("content_pieces").update({ status: "awaiting_approval" }).eq("id", piece.id);
    await sb.from("content_jobs").update({ status: "awaiting_approval", locked_until: null }).eq("id", job.id);
    return { status: "awaiting_approval" };
  }

  const spend = await spendStatus(sb, job.business_id);
  if (!spend.ok) {
    const msg = `This month's content budget (${money(spend.budgetCents)}) is used up.`;
    await sb.from("content_pieces").update({ status: "failed" }).eq("id", piece.id);
    await sb.from("content_jobs").update({ status: "failed", error: msg, locked_until: null }).eq("id", job.id);
    await logEvent(sb, {
      business_id: job.business_id,
      brand_id: piece.brand_id,
      job_id: job.id,
      level: "error",
      message: msg,
    });
    return { status: "failed" };
  }

  const agent = steps[job.step];

  await logEvent(sb, {
    business_id: job.business_id,
    brand_id: piece.brand_id,
    job_id: job.id,
    agent_id: agent.id,
    message: `▶ ${agent.name} — step ${job.step + 1}/${steps.length}`,
  });

  try {
    const { data, costCents } = await runAgent(agent.id, buildInput(agent, piece as PieceRow, brand as ContentBrand));

    // The fan-out: adapt and edit both emit variations.
    let extra = "";
    const schema = AGENT_SCHEMAS[agent.id];
    if (schema.artifact === "adapted" || schema.artifact === "final") {
      const n = await writeVariations(sb, piece as PieceRow, (data as { variations?: unknown }).variations);
      extra = ` · ${n} variations`;
    }

    const artifacts = {
      ...(piece.artifacts ?? {}),
      [schema.artifact]: { content: JSON.stringify(data, null, 2), created_at: new Date().toISOString() },
    };

    const last = job.step + 1 >= steps.length;
    await sb
      .from("content_pieces")
      .update({
        artifacts,
        current_stage: agent.stage,
        status: last ? "awaiting_approval" : "running",
      })
      .eq("id", piece.id);

    await sb
      .from("content_jobs")
      .update({
        step: job.step + 1,
        status: last ? "awaiting_approval" : "running",
        cost_cents: job.cost_cents + costCents,
        attempts: 0, // a good step clears the retry counter
        error: null,
        locked_until: null,
        run_after: new Date().toISOString(),
      })
      .eq("id", job.id);

    await logEvent(sb, {
      business_id: job.business_id,
      brand_id: piece.brand_id,
      job_id: job.id,
      agent_id: agent.id,
      level: "success",
      message: `✓ ${agent.name}${extra} · ${money(costCents)}`,
      cost_cents: costCents,
    });

    return { status: last ? "awaiting_approval" : "running", stage: agent.stage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const attempts = (job.attempts ?? 0) + 1;
    const canRetry = isRetryable(err) && attempts < 4;

    if (canRetry) {
      // The SEO engine has no branch here at all — a single 529 ends the run.
      const runAfter = new Date(Date.now() + backoffMs(attempts)).toISOString();
      await sb
        .from("content_jobs")
        .update({
          status: "queued",
          attempts,
          error: msg,
          last_error_at: new Date().toISOString(),
          run_after: runAfter,
          locked_until: null,
        })
        .eq("id", job.id);
      await logEvent(sb, {
        business_id: job.business_id,
        brand_id: piece.brand_id,
        job_id: job.id,
        agent_id: agent.id,
        message: `⚠ ${agent.name} hit a temporary error — retrying (${attempts}/3). ${msg}`,
      });
      return { status: "queued" };
    }

    await sb.from("content_pieces").update({ status: "failed" }).eq("id", piece.id);
    await sb
      .from("content_jobs")
      .update({
        status: "failed",
        attempts,
        error: msg,
        last_error_at: new Date().toISOString(),
        locked_until: null,
      })
      .eq("id", job.id);
    await logEvent(sb, {
      business_id: job.business_id,
      brand_id: piece.brand_id,
      job_id: job.id,
      agent_id: agent.id,
      level: "error",
      message: `✕ ${agent.name} failed: ${msg}`,
    });
    return { status: "failed" };
  }
}
