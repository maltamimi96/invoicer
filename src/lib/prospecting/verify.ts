/**
 * The verifying agent — one call per candidate that survived screening.
 *
 * Its whole job is the judgement a filter can't make: "is this actually a
 * service-based tradie?" Places says a business is called "Apex Solutions" in
 * the "contractor" category; whether that's a sole-trader sparky or a
 * 200-person facilities firm is a reading task.
 *
 * Deliberately narrow: it gets the listing and the criteria, and returns a
 * fit/no-fit with a score and a sentence of reasoning. It does NOT decide
 * whether to add anyone — that's the operator's call in the review queue.
 *
 * Cheap model on purpose. This runs per candidate and a hunt can return
 * hundreds; the reasoning required is "does this description match those
 * words", which does not need the expensive tier. The cost model is the whole
 * reason screening runs first.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "@/lib/ai/models";
import type { PlaceHit } from "./places";

const anthropic = new Anthropic();

export interface Verdict {
  fit: boolean;
  score: number;        // 0-100
  reasoning: string;
  cost_cents: number;
}

/** Sonnet rates, cents per 1k tokens. Matches the content engine's model. */
const RATE = { in: 0.3, out: 1.5 };

function costOf(u: { input_tokens: number; output_tokens: number }): number {
  return (u.input_tokens / 1000) * RATE.in + (u.output_tokens / 1000) * RATE.out;
}

const SYSTEM = `You screen business listings against a prospecting brief.

You will be given one business listing and the operator's criteria. Decide
whether this business matches the criteria.

Rules:
- Judge ONLY from the listing. Do not speculate about what the business might
  also do. If the listing is too thin to tell, that is a low score, not a guess.
- "No website" has already been verified in code before you see this. Never
  contradict it, and never treat a Facebook or directory page as a website.
- Be decisive. A score of 50 helps nobody — commit to a judgement.
- Reasoning is ONE sentence, written for the operator, naming the specific
  thing that decided it. Not "appears to match the criteria".

Respond with JSON only:
{"fit": boolean, "score": 0-100, "reasoning": "one sentence"}`;

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

export async function verifyCandidate(
  hit: PlaceHit, criteria: string,
): Promise<Verdict> {
  const res = await anthropic.messages.create({
    model: AI_MODELS.balanced,
    max_tokens: 300,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `CRITERIA:\n${criteria}\n\nLISTING:\n${listingText(hit)}`,
    }],
  });

  const cost = costOf(res.usage);
  const text = res.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text : "";

  // The model is asked for bare JSON but sometimes wraps it in a fence. Pull
  // the first object rather than failing the whole candidate over formatting.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return { fit: false, score: 0, reasoning: "Could not read the verdict.", cost_cents: cost };
  }
  try {
    const v = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, Number(v.score) || 0));
    return {
      fit: Boolean(v.fit),
      score,
      reasoning: String(v.reasoning ?? "").slice(0, 500) || "No reason given.",
      cost_cents: cost,
    };
  } catch {
    return { fit: false, score: 0, reasoning: "Verdict was not valid JSON.", cost_cents: cost };
  }
}
