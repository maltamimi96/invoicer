/**
 * The audit agent — it judges the RUN, not the businesses.
 *
 * A hunt that returns three prospects when you asked for fifty is the common
 * case, and v1 just showed you the number. That leaves you guessing: were the
 * search terms wrong, is the area too small, did the no-website filter eat
 * everything, or are the criteria impossible? Those are four different fixes
 * and the funnel counts alone don't distinguish them.
 *
 * So this reads the run's own evidence — where candidates were lost, which
 * named requirement failed most often, what the rejections actually said — and
 * names the problem with a fix. It runs once per run, so it can afford to
 * think harder than the per-candidate verifier.
 *
 * It is diagnostic only. It never changes the hunt: a agent that silently
 * rewrote your criteria would make the next run's results unexplainable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "@/lib/ai/models";
import type { ProspectHuntParam } from "@/types/database";

const anthropic = new Anthropic();

const RATE = { in: 0.3, out: 1.5 };

export interface AuditProblem {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** The concrete change to make. Not advice — an instruction. */
  fix: string;
}

export interface AuditReport {
  summary: string;
  problems: AuditProblem[];
  cost_cents: number;
}

export interface AuditInput {
  criteria: string;
  params: ProspectHuntParam[];
  queries: string[];
  areaLabel: string;
  filters: Record<string, unknown>;
  target: number;
  found: number;
  screenedOut: number;
  verified: number;
  rejected: number;
  /** Screening reasons, counted: { "Has a real website": 22 }. */
  screenReasons: Record<string, number>;
  /** Named requirements that failed, counted by label. */
  paramFailures: Record<string, number>;
  /** A handful of actual rejection sentences — the richest signal here. */
  sampleRejections: string[];
}

const SYSTEM = `You audit a prospecting run and explain why it produced what it
produced. You are talking to the small-business owner who set the hunt up, not
to an engineer.

You are given the hunt's configuration and the funnel: how many businesses
Google returned, how many were filtered out and why, how many an agent judged
a fit, and which named requirements failed most.

Rules:
- Diagnose from the numbers given. Never invent a cause you cannot see in them.
- Rank by what actually cost the most prospects. If 22 of 30 were dropped by
  one filter, that is the headline, not a stylistic note about the criteria.
- Every problem needs a fix that is a specific change: which setting, and what
  to change it to. "Broaden your criteria" is useless. "Drop 'no website' —
  it removed 22 of 30" is useful.
- If the run went well, say so plainly and return few or no problems. Do not
  manufacture concerns to look thorough.
- Plain words. No jargon, no hedging.

Respond with JSON only:
{"summary": "one or two sentences",
 "problems": [{"severity":"high|medium|low","title":"short","detail":"why, citing the numbers","fix":"the specific change"}]}`;

function brief(i: AuditInput): string {
  const lines = [
    `TARGET: ${i.target} prospects`,
    `SEARCH TERMS: ${i.queries.join(", ") || "(none)"}`,
    `AREA: ${i.areaLabel}`,
    `FILTERS: ${JSON.stringify(i.filters)}`,
    `CRITERIA: ${i.criteria}`,
  ];

  if (i.params.length) {
    lines.push(`NAMED REQUIREMENTS:\n${i.params.map((p) =>
      `  - ${p.label}${p.required ? " (required)" : ""}: ${p.requirement}`).join("\n")}`);
  }

  lines.push(
    "",
    "FUNNEL:",
    `  ${i.found} returned by Google`,
    `  ${i.screenedOut} removed by filters or already known`,
    `  ${i.verified} judged a fit`,
    `  ${i.rejected} judged not a fit`,
  );

  const reasons = Object.entries(i.screenReasons).sort((a, b) => b[1] - a[1]);
  if (reasons.length) {
    lines.push("", "WHY THEY WERE FILTERED OUT:",
      ...reasons.map(([r, n]) => `  ${n} × ${r}`));
  }

  const fails = Object.entries(i.paramFailures).sort((a, b) => b[1] - a[1]);
  if (fails.length) {
    lines.push("", "REQUIREMENTS THAT FAILED MOST:",
      ...fails.map(([r, n]) => `  ${n} × ${r}`));
  }

  if (i.sampleRejections.length) {
    lines.push("", "SAMPLE REJECTIONS:",
      ...i.sampleRejections.slice(0, 8).map((r) => `  - ${r}`));
  }

  return lines.join("\n");
}

export async function auditRun(input: AuditInput): Promise<AuditReport> {
  try {
    const res = await anthropic.messages.create({
      model: AI_MODELS.balanced,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: brief(input) }],
    });

    const cost = (res.usage.input_tokens / 1000) * RATE.in
      + (res.usage.output_tokens / 1000) * RATE.out;

    const text = res.content.find((b) => b.type === "text");
    const raw = text && text.type === "text" ? text.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { summary: "", problems: [], cost_cents: cost };

    const parsed = JSON.parse(match[0]);
    const problems: AuditProblem[] = Array.isArray(parsed.problems)
      ? parsed.problems.slice(0, 6).map((p: Record<string, unknown>) => ({
          severity: (["high", "medium", "low"] as const)
            .includes(p.severity as "high") ? p.severity as AuditProblem["severity"] : "medium",
          title: String(p.title ?? "").slice(0, 120),
          detail: String(p.detail ?? "").slice(0, 600),
          fix: String(p.fix ?? "").slice(0, 400),
        })).filter((p: AuditProblem) => p.title)
      : [];

    return {
      summary: String(parsed.summary ?? "").slice(0, 600),
      problems,
      cost_cents: cost,
    };
  } catch {
    // The audit is commentary on work already done and paid for. Losing it
    // must never lose the run's actual results.
    return { summary: "", problems: [], cost_cents: 0 };
  }
}
