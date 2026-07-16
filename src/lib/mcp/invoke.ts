/**
 * Run a registry tool in-process.
 *
 * The MCP server reaches these handlers through `server.tool(...)`, which
 * authenticates via an `inv_*` API key and validates arguments against the
 * tool's zod shape before dispatching. Callers here have neither, so this
 * module supplies both: it validates the arguments and synthesises the auth
 * context the handlers expect.
 */

import { z } from "zod";
import type { ApiScope } from "@/types/database";
import { TOOL_SPECS_BY_NAME } from "./collect";

export interface InvokeContext {
  /** Resolved server-side from the session — never accepted from a client. */
  businessId: string;
  userId: string;
  /** Derived from the caller's role, not assumed. */
  scopes: ApiScope[];
}

/** Blocks the Messages API accepts inside a tool_result. */
type ResultBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
    };

export type { ResultBlock };

export interface ToolOutcome {
  /** Full tool_result body — text and any images the tool returned. */
  content: ResultBlock[];
  /** Just the text, for logging, webhooks and the UI step label. */
  text: string;
  isError: boolean;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Convert one MCP content block to a Messages API block.
 *
 * The two formats differ and it's easy to miss: MCP images are
 * `{type:"image", data, mimeType}` while the Messages API wants
 * `{type:"image", source:{type:"base64", media_type, data}}`. Returns null for
 * anything unrecognised or unsupported rather than passing it through — an
 * invalid block is a 400 for the whole turn.
 */
export function toResultBlock(b: unknown): ResultBlock | null {
  if (!b || typeof b !== "object") return null;
  const block = b as { type?: string; text?: string; data?: string; mimeType?: string };

  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }

  if (block.type === "image" && typeof block.data === "string") {
    // The API accepts a fixed set; a HEIC straight off an iPhone is a 400.
    const mime = (block.mimeType ?? "").toLowerCase();
    if (!IMAGE_TYPES.has(mime)) return null;
    return {
      type: "image",
      source: { type: "base64", media_type: mime as "image/jpeg", data: block.data },
    };
  }

  return null;
}

/**
 * Normalise an MCP tool result.
 *
 * Images are preserved, not flattened away: `view_job_photos` returns the
 * actual job photos as image blocks, and dropping them would leave the
 * assistant unable to see a work order's photos at all — something /api/mcp
 * can already do.
 */
function toOutcome(raw: unknown): ToolOutcome {
  if (raw && typeof raw === "object" && "content" in raw) {
    const r = raw as { content?: unknown[]; isError?: boolean };
    const content = (r.content ?? []).map(toResultBlock).filter((b): b is ResultBlock => b !== null);
    const text = content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // tool_result content must not be empty.
    if (content.length === 0) content.push({ type: "text", text: "Done." });

    return { content, text: text || "Done.", isError: r.isError === true };
  }

  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  return { content: [{ type: "text", text }], text, isError: false };
}

/** An error outcome, in the same shape as a successful one. */
function err(message: string): ToolOutcome {
  const text = `Error: ${message}`;
  return { content: [{ type: "text", text }], text, isError: true };
}

/**
 * Validate + run one tool. Never throws: a failure comes back as an error
 * outcome so the model can read it and correct itself, which is what the MCP
 * server's own wrapper does.
 */
export async function invokeTool(
  name: string,
  input: unknown,
  ctx: InvokeContext
): Promise<ToolOutcome> {
  const spec = TOOL_SPECS_BY_NAME[name];
  if (!spec) return err(`no such tool "${name}"`);

  // The MCP server validates against the shape before dispatch; nothing else
  // does, so handlers would otherwise receive raw model output.
  const parsed = z.object(spec.shape).safeParse(input ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return err(`invalid arguments for ${name} — ${detail}`);
  }

  // ctxFrom() reads auth off `extra.authInfo.extra` (see tools/shared.ts).
  const extra = { authInfo: { extra: { businessId: ctx.businessId, userId: ctx.userId, scopes: ctx.scopes } } };

  // Handlers are already wrapped in registerTools' try/catch, which converts a
  // throw into an errorText result — so a rejection here would be unexpected.
  // Catch anyway: one bad tool must not take down the whole turn.
  try {
    return toOutcome(await spec.handler(parsed.data, extra));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
