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

export interface ToolOutcome {
  /** Text handed back to the model as the tool_result body. */
  text: string;
  isError: boolean;
}

/** Flatten an MCP tool result (`{content:[{type:"text",text}], isError?}`). */
function toOutcome(raw: unknown): ToolOutcome {
  if (raw && typeof raw === "object" && "content" in raw) {
    const r = raw as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    const text = (r.content ?? [])
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    return { text: text || "Done.", isError: r.isError === true };
  }
  return { text: typeof raw === "string" ? raw : JSON.stringify(raw), isError: false };
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
  if (!spec) return { text: `Error: no such tool "${name}"`, isError: true };

  // The MCP server validates against the shape before dispatch; nothing else
  // does, so handlers would otherwise receive raw model output.
  const parsed = z.object(spec.shape).safeParse(input ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { text: `Error: invalid arguments for ${name} — ${detail}`, isError: true };
  }

  // ctxFrom() reads auth off `extra.authInfo.extra` (see tools/shared.ts).
  const extra = { authInfo: { extra: { businessId: ctx.businessId, userId: ctx.userId, scopes: ctx.scopes } } };

  // Handlers are already wrapped in registerTools' try/catch, which converts a
  // throw into an errorText result — so a rejection here would be unexpected.
  // Catch anyway: one bad tool must not take down the whole turn.
  try {
    return toOutcome(await spec.handler(parsed.data, extra));
  } catch (e) {
    return { text: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
