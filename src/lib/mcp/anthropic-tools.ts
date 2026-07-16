/**
 * Present the shared tool registry to the Anthropic Messages API.
 *
 * The registry stores each tool's params as a zod raw shape (that's what the
 * MCP server wants); Anthropic wants JSON Schema. This converts once at module
 * scope and hands back a frozen `Anthropic.Tool[]`.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOL_SPECS, type ToolSpec } from "./collect";

function toAnthropicTool(spec: ToolSpec): Anthropic.Tool {
  const schema = zodToJsonSchema(z.object(spec.shape), {
    target: "jsonSchema7",
    // Inline everything: Anthropic reads input_schema standalone, and a $ref
    // pointing at a definitions block we don't send would be unresolvable.
    $refStrategy: "none",
  }) as Record<string, unknown>;

  // Drop the JSON Schema dialect marker — it's meaningless to the tool-use API
  // and only adds bytes to a payload that sits in the prompt cache prefix.
  delete schema.$schema;

  return {
    name: spec.name,
    description: spec.description,
    input_schema: schema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Built once at module scope — same reasoning as TOOL_SPECS. These render at
 * the head of every request, so a stable serialization is what keeps the prompt
 * cache warm across turns.
 */
export const ANTHROPIC_TOOLS: Anthropic.Tool[] = TOOL_SPECS.map(toAnthropicTool);
