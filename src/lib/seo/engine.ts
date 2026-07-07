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
  const steps = resolveSteps(contentType);
  const idx = job.step;

  // All steps done → wait for human approval.
  if (idx >= steps.length) {
    await sb.from("seo_content_pieces").update({ pipeline_status: "awaiting_approval" }).eq("id", pieceId);
    await sb.from("seo_jobs").update({ status: "awaiting_approval" }).eq("id", job.id);
    return { status: "awaiting_approval" };
  }

  const agentId = steps[idx];
  const pieceLike: PieceLike = {
    topic: piece.topic,
    content_type: contentType,
    artifacts: piece.artifacts ?? {},
    domain: piece.seo_sites?.domain ?? null,
  };

  try {
    const { content, costCents } = await runAgent(agentId, pieceLike);
    const agent = SEO_AGENTS_BY_ID[agentId];
    const artifacts = { ...(piece.artifacts ?? {}) };
    for (const key of agent?.produces ?? []) {
      artifacts[key] = { content, created_at: new Date().toISOString() };
    }

    const isLast = idx + 1 >= steps.length;
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
    return { status: "failed" };
  }
}
