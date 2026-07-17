/**
 * The Content Studio agent registry.
 *
 * Plain module — no server imports — so the UI and the engine read one
 * definition of the pipeline instead of two. This shape is lifted from
 * src/lib/seo/pipeline.ts, which is the best idea in that plugin.
 *
 * One difference worth understanding: the SEO chain is linear, one piece in and
 * one article out. This one FANS OUT. `angle-strategist` produces N distinct
 * angles and `platform-adapter` renders each to every requested platform, so a
 * single piece yields N x P variations. The fan-out happens inside the adapt
 * step and is written to content_variations rows — one job per piece, not N.
 */

export type ContentStage =
  | "discovery" // find topics worth making
  | "angles"    // turn one topic into genuinely different creative angles
  | "hooks"     // the first line that stops the scroll
  | "draft"     // write it
  | "voice"     // make it sound like the client, not like an AI
  | "adapt"     // render each angle per platform
  | "edit";     // fact + claims gate

/** The products each stage hands to the next. */
export type ContentArtifactKey =
  /** The scout's findings, carried onto the piece so the chain can read them.
   *  The SEO equivalent is declared and consumed but never written — its
   *  research is thrown away. This one is populated when the piece is created. */
  | "research"
  | "angles"
  | "hooks"
  | "draft"
  | "voiced"
  | "adapted"
  | "final";

/** What a piece asks for. */
export type ContentKind = "script" | "post" | "hooks" | "campaign";

/** Platforms we can render for. The registry is the source of truth — the DB
 *  stores platforms as a TEXT[] and validation happens here. */
export const PLATFORMS = [
  { id: "instagram", label: "Instagram", blurb: "Reels + feed. Visual-first, caption does the selling." },
  { id: "facebook", label: "Facebook", blurb: "Older, local audience. Longer copy works; community tone." },
  { id: "tiktok", label: "TikTok", blurb: "Hook in the first second or it's gone. Native, unpolished." },
  { id: "linkedin", label: "LinkedIn", blurb: "Commercial work. Credibility over flash." },
  { id: "youtube", label: "YouTube Shorts", blurb: "Searchable. Title and first frame carry it." },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

const PLATFORM_IDS = new Set<string>(PLATFORMS.map((p) => p.id));

/** Coerce untrusted platform input — the client picks these. */
export function validPlatforms(input: unknown): PlatformId[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p): p is PlatformId => typeof p === "string" && PLATFORM_IDS.has(p));
}

export interface ContentAgentDef {
  /** Matches the prompt filename: ./agents/<id>.md */
  id: string;
  name: string;
  role: string;
  stage: ContentStage;
  /** Where it sits: the linear piece pipeline, or standalone discovery. */
  track: "pipeline" | "discovery";
  produces: ContentArtifactKey[];
  consumes: ContentArtifactKey[];
  /** Server tools this agent gets. */
  tools: Array<"web_search">;
  /** Only for the draft branch: which kinds this writer handles. */
  kinds?: ContentKind[];
  /** Strategy gets the bigger model; rendering doesn't need it. */
  model: "opus" | "sonnet";
}

export const CONTENT_AGENTS: ContentAgentDef[] = [
  {
    id: "topic-scout",
    name: "Topic Scout",
    role: "Researches the client's trade, market and season to find topics worth posting about.",
    stage: "discovery",
    track: "discovery",
    produces: ["research"],
    consumes: [],
    tools: ["web_search"],
    // Strategy: the difference between roofing topics and "business" topics.
    model: "opus",
  },
  {
    id: "angle-strategist",
    name: "Angle Strategist",
    role: "Turns one topic into genuinely different creative angles — not rewordings.",
    stage: "angles",
    track: "pipeline",
    produces: ["angles"],
    consumes: ["research"],
    tools: [],
    model: "opus",
  },
  {
    id: "hook-writer",
    name: "Hook Writer",
    role: "Writes the scroll-stopping first line for each angle.",
    stage: "hooks",
    track: "pipeline",
    produces: ["hooks"],
    consumes: ["angles"],
    tools: [],
    model: "sonnet",
  },
  {
    id: "script-writer",
    name: "Script Writer",
    role: "Writes a short-form video script per angle: hook, beats, voiceover, on-screen text, CTA.",
    stage: "draft",
    track: "pipeline",
    produces: ["draft"],
    consumes: ["angles", "hooks"],
    tools: [],
    kinds: ["script"],
    model: "sonnet",
  },
  {
    id: "caption-writer",
    name: "Caption Writer",
    role: "Writes the post body, caption, hashtags and first comment per angle.",
    stage: "draft",
    track: "pipeline",
    produces: ["draft"],
    consumes: ["angles", "hooks"],
    tools: [],
    kinds: ["post"],
    model: "sonnet",
  },
  {
    id: "brand-voice-guardian",
    name: "Brand Voice Guardian",
    role: "Rewrites the draft in the client's actual voice and strips their banned phrases.",
    stage: "voice",
    track: "pipeline",
    produces: ["voiced"],
    consumes: ["draft"],
    tools: [],
    model: "sonnet",
  },
  {
    id: "platform-adapter",
    name: "Platform Adapter",
    role: "Renders every angle for every requested platform, respecting each one's format and length.",
    stage: "adapt",
    track: "pipeline",
    produces: ["adapted"],
    consumes: ["voiced"],
    tools: [],
    model: "sonnet",
  },
  {
    id: "editor-compliance",
    name: "Editor & Compliance",
    role: "Fact-checks, and flags claims the client can't stand behind — licensing, insurance, warranties.",
    stage: "edit",
    track: "pipeline",
    produces: ["final"],
    consumes: ["adapted"],
    tools: ["web_search"],
    model: "sonnet",
  },
];

export const CONTENT_AGENTS_BY_ID: Record<string, ContentAgentDef> = Object.fromEntries(
  CONTENT_AGENTS.map((a) => [a.id, a])
);

/** Display order for the pipeline board. */
export const CONTENT_STAGES: Array<{ id: ContentStage; label: string }> = [
  { id: "discovery", label: "Research" },
  { id: "angles", label: "Angles" },
  { id: "hooks", label: "Hooks" },
  { id: "draft", label: "Draft" },
  { id: "voice", label: "Voice" },
  { id: "adapt", label: "Platforms" },
  { id: "edit", label: "Review" },
];

export const CONTENT_ARTIFACTS: Record<ContentArtifactKey, { label: string }> = {
  research: { label: "Research" },
  angles: { label: "Angles" },
  hooks: { label: "Hooks" },
  draft: { label: "Draft" },
  voiced: { label: "In brand voice" },
  adapted: { label: "Platform versions" },
  final: { label: "Reviewed" },
};

/**
 * The actual runtime chain for a kind.
 *
 * `topic-scout` is deliberately absent: it's a discovery-track agent that runs
 * standalone and seeds topics. Its output reaches the chain through the
 * piece's `research` artifact, which is written at piece creation.
 *
 * `hooks` is a short chain on purpose — a hooks pack is a deliverable in its
 * own right, and there's nothing to voice or adapt.
 */
export function executableSteps(kind: ContentKind): ContentAgentDef[] {
  if (kind === "hooks") {
    return [CONTENT_AGENTS_BY_ID["angle-strategist"], CONTENT_AGENTS_BY_ID["hook-writer"]];
  }

  const writer = kind === "script" ? "script-writer" : "caption-writer";
  return [
    CONTENT_AGENTS_BY_ID["angle-strategist"],
    CONTENT_AGENTS_BY_ID["hook-writer"],
    CONTENT_AGENTS_BY_ID[writer],
    CONTENT_AGENTS_BY_ID["brand-voice-guardian"],
    CONTENT_AGENTS_BY_ID["platform-adapter"],
    CONTENT_AGENTS_BY_ID["editor-compliance"],
  ];
}
