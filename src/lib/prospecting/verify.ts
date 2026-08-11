/**
 * The verifying agent — one call per candidate that survived screening.
 *
 * Its whole job is the judgement a filter can't make: "is this actually a
 * service-based tradie?" Places says a business is called "Apex Solutions" in
 * the "contractor" category; whether that's a sole-trader sparky or a
 * 200-person facilities firm is a reading task.
 *
 * Named params are judged ONE BY ONE and reported that way. With a single
 * paragraph of criteria a rejection can only say "not a fit", which tells you
 * nothing about what to change. With named requirements it says which one
 * failed, and the auditor can then count failures per requirement and point at
 * the one that's killing the run.
 *
 * Cheap model on purpose. This runs per candidate and a hunt can return
 * hundreds; the cost model is the whole reason screening runs first.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "@/lib/ai/models";
import type { PlaceHit } from "./places";
import type { ProspectHuntParam } from "@/types/database";

const anthropic = new Anthropic();

export interface ParamResult {
  id: string;
  label: string;
  pass: boolean;
  note: string;
}

export interface Verdict {
  fit: boolean;
  score: number;        // 0-100
  reasoning: string;
  params: ParamResult[];
  cost_cents: number;
}

/** Sonnet rates, cents per 1k tokens. Matches the content engine's model. */
const RATE = { in: 0.3, out: 1.5 };

function costOf(u: { input_tokens: number; output_tokens: number }): number {
  return (u.input_tokens / 1000) * RATE.in + (u.output_tokens / 1000) * RATE.out;
}

const SYSTEM = `You screen business listings against a prospecting brief.

You are given one business listing, the operator's overall criteria, and
possibly a list of named requirements. Decide whether this business matches.

Rules:
- Judge ONLY from the listing. Do not speculate about what the business might
  also do. If the listing is too thin to tell, that is a fail with a low score,
  not a guess.
- "No website" has already been verified in code before you see this. Never
  contradict it, and never treat a Facebook or directory page as a website.
- Judge each named requirement separately and say why for each. A requirement
  marked required:true that fails means the business is NOT a fit, whatever
  the others say.
- Be decisive. A score of 50 helps nobody — commit to a judgement.
- Reasoning is ONE sentence for the operator, naming the specific thing that
  decided it. Never "appears to match the criteria".

Respond with JSON only:
{"fit": boolean, "score": 0-100, "reasoning": "one sentence",
 "params": [{"id": "the id given", "pass": boolean, "note": "few words"}]}
If there are no named requirements, return an empty params array.`;

function listingText(hit: PlaceHit): string {
  return [
    `Name: ${hit.name}`,
    hit.category ? `Category: ${hit.category}` : null,
    hit.address ? `Address: ${hit.address}` : null,
    hit.phone ? `Phone: ${hit.phone}` : "Phone: none listed",
    hit.website ? `Website on listing: ${hit.website}` : "Website: NONE",
    hit.rating != null ? `Rating: ${hit.rating} from ${hit.review_count ?? 0} reviews` : "No rating",
  ].filter(Boolean).join("\n");
}

function paramsText(params: ProspectHuntParam[]): string {
  if (!params.length) return "";
  return "\n\nNAMED REQUIREMENTS:\n" + params.map((p) =>
    `- id=${p.id} | ${p.label}${p.required ? " (REQUIRED)" : ""}: ${p.requirement}`,
  ).join("\n");
}

export async function verifyCandidate(
  hit: PlaceHit, criteria: string, params: ProspectHuntParam[] = [],
): Promise<Verdict> {
  const res = await anthropic.messages.create({
    model: AI_MODELS.balanced,
    max_tokens: 700,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `CRITERIA:\n${criteria}${paramsText(params)}\n\nLISTING:\n${listingText(hit)}`,
    }],
  });

  const cost = costOf(res.usage);
  const text = res.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text : "";

  // The model is asked for bare JSON but sometimes wraps it in a fence. Pull
  // the first object rather than failing the whole candidate over formatting.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return { fit: false, score: 0, reasoning: "Could not read the verdict.", params: [], cost_cents: cost };
  }

  try {
    const v = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, Number(v.score) || 0));

    // Re-attach labels from the hunt rather than trusting the model to echo
    // them back — the id is the only thing it needs to get right.
    const byId = new Map(params.map((p) => [p.id, p]));
    const results: ParamResult[] = Array.isArray(v.params)
      ? v.params.flatMap((r: { id?: string; pass?: unknown; note?: unknown }) => {
          const def = r.id ? byId.get(String(r.id)) : undefined;
          if (!def) return [];
          return [{
            id: def.id,
            label: def.label,
            pass: Boolean(r.pass),
            note: String(r.note ?? "").slice(0, 200),
          }];
        })
      : [];

    // A required param that failed overrules a cheerful `fit: true`. The
    // operator marked it required; the model doesn't get a veto on that.
    const failedRequired = results.some((r) => !r.pass && byId.get(r.id)?.required);
    const fit = Boolean(v.fit) && !failedRequired;

    return {
      fit,
      score: failedRequired ? Math.min(score, 40) : score,
      reasoning: String(v.reasoning ?? "").slice(0, 500) || "No reason given.",
      params: results,
      cost_cents: cost,
    };
  } catch {
    return { fit: false, score: 0, reasoning: "Verdict was not valid JSON.", params: [], cost_cents: cost };
  }
}
