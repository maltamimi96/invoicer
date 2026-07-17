"use client";

/**
 * Rendering an agent's output so a human can read it.
 *
 * Both plugins stored the model's work and then showed it raw: SEO dumped
 * finished articles into a <pre className="font-mono"> (literal **, #, and a
 * wall of grey), and Content Studio stored JSON.stringify'd artifacts. Neither
 * is something you'd hand a client.
 *
 * Two shapes arrive here:
 *   - markdown  (SEO articles, Content drafts) -> render it
 *   - JSON      (Content's structured agents)  -> render the structure
 *
 * The distinction is detected, not configured, so callers don't have to know.
 */

import { useState } from "react";
import { Copy, Check } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="text-[11px] inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
    >
      {done ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

function parseJson(text: string): unknown | null {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{children}</span>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border bg-background p-3 space-y-1.5">{children}</div>
);

/** A script's beats — the shape a person actually shoots from. */
function Beats({ beats }: { beats: Array<Record<string, unknown>> }) {
  return (
    <ol className="space-y-2">
      {beats.map((b, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="text-[10px] text-muted-foreground mt-0.5 w-4 shrink-0">{i + 1}</span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-medium break-words">{String(b.shot ?? "")}</p>
            {b.vo ? <p className="text-xs text-muted-foreground break-words">“{String(b.vo)}”</p> : null}
            {b.on_screen ? (
              <p className="text-[10px] break-words">
                <span className="rounded bg-muted px-1 py-0.5">on-screen: {String(b.on_screen)}</span>
              </p>
            ) : null}
          </div>
          {typeof b.seconds === "number" && (
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{b.seconds}s</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Render one known agent payload.
 * Returns null when the shape isn't recognised, so the caller can fall back
 * rather than show nothing.
 */
function KnownShape({ data }: { data: Record<string, unknown> }) {
  // Angles
  if (Array.isArray(data.angles)) {
    return (
      <div className="space-y-2">
        {(data.angles as Array<Record<string, unknown>>).map((a, i) => (
          <Card key={i}>
            <p className="text-sm font-medium">
              {i + 1}. {String(a.label ?? "")}
            </p>
            <div className="grid gap-1 sm:grid-cols-2 text-xs">
              {a.who ? <p><Label>Who</Label><br />{String(a.who)}</p> : null}
              {a.emotion ? <p><Label>Feels</Label><br />{String(a.emotion)}</p> : null}
              {a.moment ? <p><Label>Moment</Label><br />{String(a.moment)}</p> : null}
              {a.service ? <p><Label>Points at</Label><br />{String(a.service)}</p> : null}
            </div>
            {a.rationale ? (
              <p className="text-xs text-muted-foreground border-t pt-1.5">{String(a.rationale)}</p>
            ) : null}
          </Card>
        ))}
      </div>
    );
  }

  // Hooks
  if (Array.isArray(data.hooks)) {
    return (
      <div className="space-y-2">
        {(data.hooks as Array<Record<string, unknown>>).map((h, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium break-words">“{String(h.hook ?? "")}”</p>
              <CopyButton text={String(h.hook ?? "")} />
            </div>
            {Array.isArray(h.alternates) && h.alternates.length > 0 && (
              <ul className="space-y-0.5 border-t pt-1.5">
                {(h.alternates as string[]).map((alt, j) => (
                  <li key={j} className="text-xs text-muted-foreground break-words">“{alt}”</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    );
  }

  // Scripts
  if (Array.isArray(data.scripts)) {
    return (
      <div className="space-y-2">
        {(data.scripts as Array<Record<string, unknown>>).map((s, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium break-words">“{String(s.hook ?? "")}”</p>
              <CopyButton
                text={[
                  `HOOK: ${s.hook ?? ""}`,
                  ...((s.beats as Array<Record<string, unknown>>) ?? []).map(
                    (b, n) => `${n + 1}. [${b.shot}] ${b.vo ?? ""}${b.on_screen ? ` (text: ${b.on_screen})` : ""}`
                  ),
                  `CTA: ${s.cta ?? ""}`,
                ].join("\n")}
                label="Copy script"
              />
            </div>
            {Array.isArray(s.beats) && <Beats beats={s.beats as Array<Record<string, unknown>>} />}
            {s.cta ? (
              <p className="text-xs border-t pt-1.5">
                <Label>CTA</Label> {String(s.cta)}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    );
  }

  // Posts
  if (Array.isArray(data.posts)) {
    return (
      <div className="space-y-2">
        {(data.posts as Array<Record<string, unknown>>).map((p, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium break-words">“{String(p.hook ?? "")}”</p>
              <CopyButton text={String(p.body ?? "")} label="Copy post" />
            </div>
            {p.body ? <p className="text-xs whitespace-pre-wrap break-words">{String(p.body)}</p> : null}
            {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
              <p className="text-[11px] text-primary break-words">
                {(p.hashtags as string[]).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
              </p>
            )}
            {p.first_comment ? (
              <p className="text-[11px] text-muted-foreground border-t pt-1.5">
                <Label>First comment</Label> {String(p.first_comment)}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    );
  }

  // Voiced items
  if (Array.isArray(data.items)) {
    return (
      <div className="space-y-2">
        {(data.items as Array<Record<string, unknown>>).map((it, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium break-words">“{String(it.hook ?? "")}”</p>
              <CopyButton text={String(it.body ?? "")} />
            </div>
            {it.body ? <p className="text-xs whitespace-pre-wrap break-words">{String(it.body)}</p> : null}
            {it.changed ? (
              <p className="text-[11px] text-muted-foreground border-t pt-1.5">
                <Label>Changed</Label> {String(it.changed)}
              </p>
            ) : null}
          </Card>
        ))}
        {Array.isArray(data.banned_hits) && data.banned_hits.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Removed banned phrases: {(data.banned_hits as string[]).join(", ")}
          </p>
        )}
      </div>
    );
  }

  // Scout research
  if (Array.isArray(data.topics)) {
    return (
      <div className="space-y-2">
        {(data.topics as Array<Record<string, unknown>>).map((t, i) => (
          <Card key={i}>
            <p className="text-sm font-medium break-words">{String(t.title ?? "")}</p>
            {t.detail ? <p className="text-xs text-muted-foreground break-words">{String(t.detail)}</p> : null}
            <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {t.priority ? <span className="rounded-full border px-1.5 py-0.5">Priority {String(t.priority)}</span> : null}
              {t.season ? <span className="rounded-full border px-1.5 py-0.5">{String(t.season)}</span> : null}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // A single research topic (what startContentPiece copies onto the piece).
  if (typeof data.title === "string") {
    return (
      <Card>
        <p className="text-sm font-medium break-words">{data.title}</p>
        {data.detail ? <p className="text-xs text-muted-foreground break-words">{String(data.detail)}</p> : null}
        {data.angle_hint ? (
          <p className="text-xs border-t pt-1.5">
            <Label>Angle hint</Label> {String(data.angle_hint)}
          </p>
        ) : null}
      </Card>
    );
  }

  return null;
}

/** Compliance flags — worth surfacing loudly, they're legal exposure. */
function Flags({ flags }: { flags: Array<Record<string, unknown>> }) {
  if (flags.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Claims to check ({flags.length})</p>
      {flags.map((f, i) => (
        <div
          key={i}
          className={`rounded-lg border px-2.5 py-1.5 text-xs ${
            f.severity === "blocker"
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <p className="font-medium break-words">“{String(f.claim ?? "")}”</p>
          <p className="text-muted-foreground break-words">{String(f.issue ?? "")}</p>
        </div>
      ))}
    </div>
  );
}

export function ArtifactBody({ text }: { text: string }) {
  const parsed = parseJson(text);

  if (parsed && typeof parsed === "object") {
    const data = parsed as Record<string, unknown>;
    // Called, not mounted — the null return is the "I don't know this shape"
    // signal, and we need to read it before deciding to fall back.
    const known = KnownShape({ data });
    const flags = Array.isArray(data.flags) ? (data.flags as Array<Record<string, unknown>>) : [];

    if (known !== null) {
      return (
        <div className="space-y-3">
          {known}
          <Flags flags={flags} />
        </div>
      );
    }

    // Structured, but not a shape we render specially. JSON in a code block
    // still beats a raw dump — at least it's legible.
    return (
      <pre className="text-[11px] overflow-x-auto rounded-lg border bg-muted/60 p-2.5">
        <code className="font-mono">{JSON.stringify(parsed, null, 2)}</code>
      </pre>
    );
  }

  // Markdown — SEO articles, and anything prose-shaped.
  return <Markdown>{text}</Markdown>;
}
