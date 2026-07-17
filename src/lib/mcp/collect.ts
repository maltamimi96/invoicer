/**
 * Collect every registered tool as plain data.
 *
 * `registerTools` is written against a `ToolFn` callback rather than an MCP
 * server, so passing a collector here yields the same ~200 tools `/api/mcp`
 * exposes — without an MCP server, an HTTP hop, or an API key. This is what
 * lets the in-app assistant share one tool surface with the MCP server instead
 * of maintaining a second, drifting copy.
 */

import type { z } from "zod";
import { registerTools } from "./register-tools";

export interface ToolSpec {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, extra: any) => Promise<unknown>;
}

function collect(): ToolSpec[] {
  const specs: ToolSpec[] = [];
  registerTools((name, description, shape, handler) => {
    specs.push({ name, description, shape, handler });
  });
  return specs;
}

/**
 * Built once at module scope, deliberately.
 *
 * Tool definitions are static, so re-collecting per request would burn CPU for
 * an identical result — and worse, the tool list is the head of the prompt
 * cache prefix, so any per-request rebuild risks changing its serialization and
 * silently invalidating the cache on every turn.
 */
export const TOOL_SPECS: ToolSpec[] = collect();

export const TOOL_SPECS_BY_NAME: Record<string, ToolSpec> = Object.fromEntries(
  TOOL_SPECS.map((s) => [s.name, s])
);
