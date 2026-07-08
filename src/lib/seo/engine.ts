/**
 * SEO content pipeline execution engine (docs/SEO_AGENCY_PLAN.md, Phase 2.3).
 *
 * Runs the agent chain one step per call so each Claude request fits Vercel's
 * limits. A content piece carries its artifacts (artifact_key -> {content}); the
 * driving seo_jobs row carries the step index. advanceContentJob runs the next
 * agent, stores its artifact on the piece, and advances — pausing at the edit
 * gate for human approval. Web search for the research agents is a follow-up;
 * for now agents work from the topic + prior artifacts + their own knowledge.
 *
 * Server-only module (uses the Anthropic SDK + admin Supabase client).
 */
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_PROMPTS } from "./agent-prompts.generated";
import { SEO_AGENTS_BY_ID, SEO_ARTIFACTS, executableSteps, type SeoArtifactKey } from "./pipeline";

// Latest models — strategy steps get Opus, the rest Sonnet.
const MODEL = { sonnet: "claude-sonnet-5", opus: "claude-opus-4-8" } as const;

// Rough per-1K-token cost in cents (Sonnet tier) — enough for budget tracking.
const CENTS_PER_1K_IN = 0.03;
const CENTS_PER_1K_OUT = 0.15;

const anthropic = new Anthropic();

export type ContentType = "blog" | "landing" | "email" | "social";

/** The executable content chain — shared with the UI (see pipeline.executableSteps). */
export const resolveSteps = executableSteps;

interface PieceLike {
  topic: string | null;
  content_type: ContentType;
  artifacts: Record<string, { content: string; created_at?: string }>;
  domain?: string | null;
}

/** Build the user message for an agent from the topic + the artifacts it consumes. */
function buildInput(agentId: string, piece: PieceLike): string {
  const agent = SEO_AGENTS_BY_ID[agentId];
  const parts: string[] = [];
  parts.push(
    "You are running inside a server pipeline — there is NO filesystem or workspace. " +
    "Ignore any instructions in your brief about reading or writing files/paths; the inputs you need are below, " +
    "and you must return the finished artifact directly as your reply (markdown, no preamble, no file paths).",
  );
  parts.push(`\nTopic: ${piece.topic ?? "(none given)"}`);
  parts.push(`Content type: ${piece.content_type}`);
  if (piece.domain) parts.push(`Client site: ${piece.domain}`);

  for (const key of agent?.consumes ?? []) {
    const art = piece.artifacts?.[key];
    if (art?.content) {
      parts.push(`\n## Input — ${SEO_ARTIFACTS[key as SeoArtifactKey]?.label ?? key}\n${art.content}`);
    }
  }

  const produced = (agent?.produces ?? [])
    .map((p) => SEO_ARTIFACTS[p as SeoArtifactKey]?.label ?? p)
    .join(" and ");
  parts.push(`\nProduce the ${produced || "artifact"} now. Return only its content.`);
  return parts.join("\n");
}

interface RunResult { content: string; costCents: number }

/** Run a single agent and return its artifact text + estimated cost. */
export async function runAgent(agentId: string, piece: PieceLike): Promise<RunResult> {
  const system = AGENT_PROMPTS[agentId];
  if (!system) throw new Error(`No prompt for agent "${agentId}"`);
  const agent = SEO_AGENTS_BY_ID[agentId];
  const model = MODEL[agent?.model ?? "sonnet"];

  // Research / audit agents get live web search (server-side tool — Anthropic
  // runs the searches and returns the grounded answer in one call).
  const tools = agent?.tools?.includes("web_search")
    ? ([{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] as Anthropic.Messages.MessageCreateParams["tools"])
    : undefined;

  const res = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: buildInput(agentId, piece) }],
    ...(tools ? { tools } : {}),
  });

  const content = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const usage = res.usage;
  const costCents = Math.ceil(
    (usage.input_tokens / 1000) * CENTS_PER_1K_IN + (usage.output_tokens / 1000) * CENTS_PER_1K_OUT,
  );
  return { content, costCents };
}

/** Month-to-date SEO spend vs. the business's monthly budget (cents).
 *  budgetCents === 0 means unlimited (explicit opt-out). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seoSpendStatus(sb: any, businessId: string): Promise<{ spentCents: number; budgetCents: number; ok: boolean }> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ data: biz }, { data: jobs }] = await Promise.all([
    sb.from("businesses").select("seo_monthly_budget_cents").eq("id", businessId).maybeSingle(),
    sb.from("seo_jobs").select("cost_cents").eq("business_id", businessId).gte("created_at", monthStart),
  ]);
  const budgetCents = biz?.seo_monthly_budget_cents ?? 2000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spentCents = (jobs ?? []).reduce((s: number, r: any) => s + (r.cost_cents ?? 0), 0);
  return { spentCents, budgetCents, ok: budgetCents === 0 || spentCents < budgetCents };
}

/** Append an agent-activity event (the "terminal" feed). Never throws — logging
 *  must not break the pipeline. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logEvent(sb: any, e: {
  business_id: string; site_id?: string | null; job_id?: string; agent_id?: string;
  level?: "info" | "success" | "error"; message: string; cost_cents?: number;
}): Promise<void> {
  try {
    await sb.from("seo_job_events").insert({
      business_id: e.business_id, site_id: e.site_id ?? null, job_id: e.job_id ?? null,
      agent_id: e.agent_id ?? null, level: e.level ?? "info", message: e.message, cost_cents: e.cost_cents ?? 0,
    });
  } catch { /* best-effort */ }
}

/** Pull a JSON array out of an agent reply (```json fence or first [ … ]). */
function extractJsonArray(text: string): unknown[] {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON array in reply");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Discovery — the Opportunity Scout studies the site's niche (via live web
 * search) and writes a ranked queue into seo_opportunities. One-shot agent
 * (not the content chain). Budget-gated, logs to the activity terminal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runOpportunityScout(sb: any, args: { businessId: string; siteId: string }): Promise<{ inserted: number }> {
  const { data: site } = await sb.from("seo_sites").select("domain, playbook").eq("id", args.siteId).eq("business_id", args.businessId).maybeSingle();
  if (!site) throw new Error("Site not found");

  const budget = await seoSpendStatus(sb, args.businessId);
  if (!budget.ok) throw new Error(`Monthly SEO budget reached ($${(budget.budgetCents / 100).toFixed(2)}). Raise it to run the scout.`);

  await logEvent(sb, { business_id: args.businessId, site_id: args.siteId, agent_id: "seo-opportunity-scout", message: "▶ Opportunity Scout — scanning the niche" });

  const system = AGENT_PROMPTS["seo-opportunity-scout"];
  const user = [
    "You are running in a server pipeline — there is NO filesystem. Ignore any instructions about reading or writing files/paths.",
    `Client site: ${site.domain} (playbook: ${site.playbook}).`,
    "You have live web search — study the site's niche, its competitors and the questions real searchers ask.",
    "Return ONLY a JSON array of the 12–15 highest-leverage opportunities — no prose, no markdown outside the array — in exactly this shape:",
    '[{"type":"content_gap|quick_win|technical|question|refresh","title":"short imperative","detail":"why now + the evidence","priority":1-10}]',
  ].join("\n");

  let textOut = "";
  let costCents = 0;
  try {
    const res = await anthropic.messages.create({
      model: MODEL.opus, max_tokens: 4096, system,
      messages: [{ role: "user", content: user }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] as Anthropic.Messages.MessageCreateParams["tools"],
    });
    textOut = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    costCents = Math.ceil((res.usage.input_tokens / 1000) * CENTS_PER_1K_IN + (res.usage.output_tokens / 1000) * CENTS_PER_1K_OUT);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(sb, { business_id: args.businessId, site_id: args.siteId, level: "error", message: `✗ Opportunity Scout failed — ${msg}` });
    throw e;
  }

  let items: unknown[];
  try { items = extractJsonArray(textOut); }
  catch {
    await logEvent(sb, { business_id: args.businessId, site_id: args.siteId, level: "error", message: "✗ Opportunity Scout returned no usable opportunities" });
    throw new Error("The scout didn't return usable opportunities — try again.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (items as any[]).filter((x) => x && typeof x.title === "string").slice(0, 25).map((x) => ({
    business_id: args.businessId, site_id: args.siteId,
    type: String(x.type ?? "content_gap").slice(0, 40),
    title: String(x.title).slice(0, 300),
    detail: x.detail != null ? String(x.detail).slice(0, 2000) : null,
    priority: Number.isFinite(x.priority) ? Math.max(0, Math.min(10, Math.round(x.priority))) : 5,
    status: "queued",
  }));
  if (rows.length) { const { error } = await sb.from("seo_opportunities").insert(rows); if (error) throw error; }

  await logEvent(sb, { business_id: args.businessId, site_id: args.siteId, agent_id: "seo-opportunity-scout", level: "success", cost_cents: costCents, message: `✓ Opportunity Scout → ${rows.length} opportunities · $${(costCents / 100).toFixed(2)}` });
  return { inserted: rows.length };
}

interface Job { id: string; business_id: string; step: number; input: { content_piece_id?: string }; cost_cents: number }

/**
 * Advance one content-pipeline job by a single step. Returns the new status.
 * Caller (cron/action) persists nothing else — this owns all the writes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function advanceContentJob(sb: any, job: Job): Promise<{ status: string; stage?: string }> {
  const pieceId = job.input?.content_piece_id;
  if (!pieceId) throw new Error("Job has no content_piece_id");

  const { data: piece } = await sb
    .from("seo_content_pieces")
    .select("*, seo_sites(domain)")
    .eq("id", pieceId)
    .eq("business_id", job.business_id)
    .maybeSingle();
  if (!piece) throw new Error("Content piece not found");

  const contentType = (piece.content_type ?? "blog") as ContentType;
  const siteId = piece.site_id as string | null;
  const steps = resolveSteps(contentType);
  const idx = job.step;

  // All steps done → wait for human approval.
  if (idx >= steps.length) {
    await sb.from("seo_content_pieces").update({ pipeline_status: "awaiting_approval" }).eq("id", pieceId);
    await sb.from("seo_jobs").update({ status: "awaiting_approval" }).eq("id", job.id);
    return { status: "awaiting_approval" };
  }

  // Budget gate — the non-negotiable cost cap. Stop before spending more.
  const budget = await seoSpendStatus(sb, job.business_id);
  if (!budget.ok) {
    const msg = `Monthly SEO budget reached ($${(budget.budgetCents / 100).toFixed(2)}). Raise it in SEO settings to continue.`;
    await sb.from("seo_content_pieces").update({ pipeline_status: "failed" }).eq("id", pieceId);
    await sb.from("seo_jobs").update({ status: "failed", error: msg }).eq("id", job.id);
    await logEvent(sb, { business_id: job.business_id, site_id: siteId, job_id: job.id, level: "error", message: `Budget cap reached — ${msg}` });
    return { status: "failed" };
  }

  const agentId = steps[idx];
  const agentName = SEO_AGENTS_BY_ID[agentId]?.name ?? agentId;
  const pieceLike: PieceLike = {
    topic: piece.topic,
    content_type: contentType,
    artifacts: piece.artifacts ?? {},
    domain: piece.seo_sites?.domain ?? null,
  };

  await logEvent(sb, { business_id: job.business_id, site_id: siteId, job_id: job.id, agent_id: agentId, message: `▶ ${agentName} — step ${idx + 1}/${steps.length}` });

  try {
    const { content, costCents } = await runAgent(agentId, pieceLike);
    const agent = SEO_AGENTS_BY_ID[agentId];
    const artifacts = { ...(piece.artifacts ?? {}) };
    for (const key of agent?.produces ?? []) {
      artifacts[key] = { content, created_at: new Date().toISOString() };
    }

    const isLast = idx + 1 >= steps.length;
    const producedLabels = (agent?.produces ?? []).map((k) => SEO_ARTIFACTS[k as SeoArtifactKey]?.label ?? k).join(", ");
    await logEvent(sb, { business_id: job.business_id, site_id: siteId, job_id: job.id, agent_id: agentId, level: "success", cost_cents: costCents, message: `✓ ${agentName} → ${producedLabels} · $${(costCents / 100).toFixed(2)}` });
    if (isLast) await logEvent(sb, { business_id: job.business_id, site_id: siteId, job_id: job.id, level: "success", message: "✓ Draft complete — awaiting your approval" });
    await sb.from("seo_content_pieces").update({
      artifacts,
      current_stage: agent?.stage ?? null,
      pipeline_status: isLast ? "awaiting_approval" : "running",
      status: isLast ? "approved" : piece.status,
    }).eq("id", pieceId);

    await sb.from("seo_jobs").update({
      step: idx + 1,
      status: isLast ? "awaiting_approval" : "running",
      cost_cents: (job.cost_cents ?? 0) + costCents,
      checkpoint: { last_agent: agentId },
    }).eq("id", job.id);

    return { status: isLast ? "awaiting_approval" : "running", stage: agent?.stage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("seo_content_pieces").update({ pipeline_status: "failed" }).eq("id", pieceId);
    await sb.from("seo_jobs").update({ status: "failed", error: msg }).eq("id", job.id);
    await logEvent(sb, { business_id: job.business_id, site_id: siteId, job_id: job.id, agent_id: agentId, level: "error", message: `✗ ${agentName} failed — ${msg}` });
    return { status: "failed" };
  }
}
