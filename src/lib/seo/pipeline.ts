/**
 * SEO agent pipeline registry (docs/SEO_AGENCY_PLAN.md, Phase 2).
 *
 * The 13 SEO agents (source prompts in ./agents/*.md) modelled as a pipeline:
 * each agent is a step that consumes the previous artifact and produces the
 * next. This registry is the single source of truth for BOTH the flow UI
 * (nodes + edges + per-piece status) and the job engine that executes the
 * steps by calling the Claude API with each agent's prompt.
 *
 * Plain module — safe to import from client components and server code.
 */

/** Pipeline phase an agent belongs to. */
export type SeoStage =
  | "discovery"   // decide what to work on
  | "research"    // keyword + SERP intel
  | "brief"       // merge research into a brief
  | "draft"       // write the first draft
  | "voice"       // align to brand voice
  | "humanize"    // strip AI tells
  | "optimize"    // on-page SEO tuning
  | "edit"        // editorial + fact-check gate
  | "publish"     // ship it
  | "audit";      // standalone technical audit

/** Artifact keys — the "products" each stage hands to the next. */
export type SeoArtifactKey =
  | "opportunities"
  | "audit"
  | "keyword_research"
  | "serp_analysis"
  | "brief"
  | "draft"
  | "voiced"
  | "humanized"
  | "optimized"
  | "seo_metadata"
  | "final"
  | "published";

export interface SeoAgentDef {
  id: string;                  // matches the prompt filename (./agents/<id>.md)
  name: string;                // display name
  role: string;                // one-line description of what it does
  stage: SeoStage;
  /** Where it sits: the linear content pipeline, discovery, or standalone audit. */
  track: "pipeline" | "discovery" | "audit";
  produces: SeoArtifactKey[];  // artifacts it writes
  consumes: SeoArtifactKey[];  // artifacts it reads
  /** Agent ids this one feeds into (flow edges). */
  feeds: string[];
  /** Declared tools (web search / fetch etc.) — drives execution wiring later. */
  tools: string[];
  /** Only relevant for the copywriter branch: which content types it handles. */
  contentTypes?: Array<"blog" | "landing" | "email" | "social">;
  /** Model tier hint for the job engine (strategy steps get the bigger model). */
  model: "opus" | "sonnet";
}

export const SEO_AGENTS: SeoAgentDef[] = [
  // ── Discovery ──────────────────────────────────────────────────────────────
  {
    id: "seo-opportunity-scout",
    name: "Opportunity Scout",
    role: "Studies the site's data and hands back a ranked queue of what to write or fix.",
    stage: "discovery", track: "discovery",
    produces: ["opportunities"], consumes: [], feeds: ["keyword-strategist"],
    tools: ["web_search", "web_fetch"], model: "opus",
  },
  // ── Research (parallel) ─────────────────────────────────────────────────────
  {
    id: "keyword-strategist",
    name: "Keyword Strategist",
    role: "Turns a topic into primary/secondary keywords, intent and clusters.",
    stage: "research", track: "pipeline",
    produces: ["keyword_research"], consumes: ["opportunities"], feeds: ["content-brief-architect"],
    tools: ["web_search", "web_fetch"], model: "sonnet",
  },
  {
    id: "serp-competitor-analyst",
    name: "SERP & Competitor Analyst",
    role: "Reverse-engineers page 1 and finds the content gaps to exploit.",
    stage: "research", track: "pipeline",
    produces: ["serp_analysis"], consumes: ["opportunities"], feeds: ["content-brief-architect"],
    tools: ["web_search", "web_fetch"], model: "sonnet",
  },
  // ── Brief ───────────────────────────────────────────────────────────────────
  {
    id: "content-brief-architect",
    name: "Brief Architect",
    role: "Merges keyword + SERP research into one executable content brief.",
    stage: "brief", track: "pipeline",
    produces: ["brief"], consumes: ["keyword_research", "serp_analysis"],
    feeds: ["long-form-copywriter", "conversion-copywriter", "email-social-copywriter"],
    tools: [], model: "sonnet",
  },
  // ── Draft (branch by content type) ──────────────────────────────────────────
  {
    id: "long-form-copywriter",
    name: "Long-form Copywriter",
    role: "Writes editorial blog posts, guides and pillar pages from the brief.",
    stage: "draft", track: "pipeline",
    produces: ["draft"], consumes: ["brief"], feeds: ["brand-voice-guardian"],
    tools: ["web_search"], contentTypes: ["blog"], model: "sonnet",
  },
  {
    id: "conversion-copywriter",
    name: "Conversion Copywriter",
    role: "Writes landing/sales pages and CTAs built for a single action.",
    stage: "draft", track: "pipeline",
    produces: ["draft"], consumes: ["brief"], feeds: ["brand-voice-guardian"],
    tools: [], contentTypes: ["landing"], model: "sonnet",
  },
  {
    id: "email-social-copywriter",
    name: "Email & Social Copywriter",
    role: "Writes email sequences and platform-native social posts.",
    stage: "draft", track: "pipeline",
    produces: ["draft"], consumes: ["brief"], feeds: ["brand-voice-guardian"],
    tools: [], contentTypes: ["email", "social"], model: "sonnet",
  },
  // ── Voice ───────────────────────────────────────────────────────────────────
  {
    id: "brand-voice-guardian",
    name: "Brand Voice Guardian",
    role: "Aligns the draft to the client's brand voice profile.",
    stage: "voice", track: "pipeline",
    produces: ["voiced"], consumes: ["draft"], feeds: ["humanizer"],
    tools: [], model: "sonnet",
  },
  // ── Humanize ────────────────────────────────────────────────────────────────
  {
    id: "humanizer",
    name: "Humanizer",
    role: "Strips AI tells so it reads like a person wrote it — facts preserved.",
    stage: "humanize", track: "pipeline",
    produces: ["humanized"], consumes: ["voiced"], feeds: ["on-page-seo-optimizer"],
    tools: [], model: "sonnet",
  },
  // ── Optimize ────────────────────────────────────────────────────────────────
  {
    id: "on-page-seo-optimizer",
    name: "On-page SEO Optimizer",
    role: "Tunes title, meta, headers, keyword placement, schema and alt text.",
    stage: "optimize", track: "pipeline",
    produces: ["optimized", "seo_metadata"], consumes: ["humanized", "brief"],
    feeds: ["content-editor-fact-checker"], tools: [], model: "sonnet",
  },
  // ── Edit gate (approve → publish, reject → back to draft) ────────────────────
  {
    id: "content-editor-fact-checker",
    name: "Editor & Fact-checker",
    role: "The final gate — copyedits, fact-checks, approves to FINAL or sends back.",
    stage: "edit", track: "pipeline",
    produces: ["final"], consumes: ["optimized", "brief", "seo_metadata"],
    feeds: ["site-publisher"], tools: ["web_search", "web_fetch"], model: "sonnet",
  },
  // ── Publish ─────────────────────────────────────────────────────────────────
  {
    id: "site-publisher",
    name: "Site Publisher",
    role: "Converts the approved piece to the site's format and pushes it live.",
    stage: "publish", track: "pipeline",
    produces: ["published"], consumes: ["final", "seo_metadata"], feeds: [],
    tools: ["bash"], model: "sonnet",
  },
  // ── Standalone audit ────────────────────────────────────────────────────────
  {
    id: "technical-seo-auditor",
    name: "Technical SEO Auditor",
    role: "Audits crawlability, indexation, schema and performance signals.",
    stage: "audit", track: "audit",
    produces: ["audit"], consumes: [], feeds: [],
    tools: ["web_fetch", "web_search"], model: "sonnet",
  },
];

export const SEO_AGENTS_BY_ID: Record<string, SeoAgentDef> =
  Object.fromEntries(SEO_AGENTS.map((a) => [a.id, a]));

/**
 * The ordered content-production pipeline — one entry per column in the flow
 * UI. The "draft" column holds the copywriter branch (one runs per piece,
 * chosen by content type). The edit gate loops back to draft on rejection.
 */
export interface PipelineColumn {
  stage: SeoStage;
  title: string;
  /** Agent ids in this column (>1 = parallel or a branch). */
  agents: string[];
  /** True when the agents in this column run in parallel (research). */
  parallel?: boolean;
  /** True when this column is a branch — only one agent runs per piece (draft). */
  branch?: boolean;
}

export const CONTENT_PIPELINE: PipelineColumn[] = [
  { stage: "discovery", title: "Discovery", agents: ["seo-opportunity-scout"] },
  { stage: "research", title: "Research", agents: ["keyword-strategist", "serp-competitor-analyst"], parallel: true },
  { stage: "brief", title: "Brief", agents: ["content-brief-architect"] },
  { stage: "draft", title: "Draft", agents: ["long-form-copywriter", "conversion-copywriter", "email-social-copywriter"], branch: true },
  { stage: "voice", title: "Voice", agents: ["brand-voice-guardian"] },
  { stage: "humanize", title: "Humanize", agents: ["humanizer"] },
  { stage: "optimize", title: "Optimize", agents: ["on-page-seo-optimizer"] },
  { stage: "edit", title: "Edit gate", agents: ["content-editor-fact-checker"] },
  { stage: "publish", title: "Publish", agents: ["site-publisher"] },
];

/** Artifact display metadata for the "products" UI. */
export const SEO_ARTIFACTS: Record<SeoArtifactKey, { label: string; file: string }> = {
  opportunities:    { label: "Opportunity queue", file: "OPPORTUNITIES.md" },
  audit:            { label: "Technical audit", file: "audit.md" },
  keyword_research: { label: "Keyword research", file: "01-keyword-research.md" },
  serp_analysis:    { label: "SERP analysis", file: "02-serp-analysis.md" },
  brief:            { label: "Content brief", file: "03-brief.md" },
  draft:            { label: "Draft", file: "04-draft.md" },
  voiced:           { label: "Voiced draft", file: "05-voiced.md" },
  humanized:        { label: "Humanized draft", file: "06-humanized.md" },
  optimized:        { label: "Optimized content", file: "07-optimized.md" },
  seo_metadata:     { label: "SEO metadata", file: "seo-metadata.md" },
  final:            { label: "Final (approved)", file: "FINAL.md" },
  published:        { label: "Published", file: "—" },
};

/** Ordered stage list a content piece moves through (for progress + status). */
export const PIPELINE_STAGE_ORDER: SeoStage[] =
  CONTENT_PIPELINE.map((c) => c.stage);

/**
 * The executable agent sequence for one content piece (research → edit gate).
 * Discovery + publish are separate tracks; the copywriter is resolved from the
 * content type. Client-safe — the engine and the UI both read it from here.
 */
export function executableSteps(
  contentType: "blog" | "landing" | "email" | "social",
): string[] {
  const copywriter =
    contentType === "landing" ? "conversion-copywriter"
    : contentType === "email" || contentType === "social" ? "email-social-copywriter"
    : "long-form-copywriter";
  return [
    "keyword-strategist",
    "serp-competitor-analyst",
    "content-brief-architect",
    copywriter,
    "brand-voice-guardian",
    "humanizer",
    "on-page-seo-optimizer",
    "content-editor-fact-checker",
  ];
}
