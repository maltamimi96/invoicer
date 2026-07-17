import { describe, it, expect } from "vitest";
import { TOOL_SPECS, TOOL_SPECS_BY_NAME } from "../collect";
import { ANTHROPIC_TOOLS } from "../anthropic-tools";

/**
 * These lock the shared registry's contract. `/api/mcp` and the in-app
 * assistant both read from it, so a regression here silently changes what
 * Claude Code, the claude.ai connector, and the assistant can all do.
 */
describe("tool registry", () => {
  it("collects the full tool surface", () => {
    // Guards against a sub-registrar being dropped in a refactor. Deliberately
    // a floor, not an exact count — adding tools is normal and shouldn't fail.
    expect(TOOL_SPECS.length).toBeGreaterThan(150);
  });

  it("has no duplicate tool names", () => {
    const names = TOOL_SPECS.map((s) => s.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("indexes every spec by name", () => {
    expect(Object.keys(TOOL_SPECS_BY_NAME).length).toBe(TOOL_SPECS.length);
  });

  it("still registers known tools from every sub-registrar", () => {
    // One per registrar: core, plugin-forms, seo, expenses, inventory,
    // timesheets, assets, prospects.
    for (const name of [
      "list_customers",
      "list_public_forms",
      "list_seo_sites",
      "list_expenses",
      "list_inventory",
      "get_timesheet",
      "list_assets",
      "list_prospects",
    ]) {
      expect(TOOL_SPECS_BY_NAME[name], `missing tool: ${name}`).toBeDefined();
    }
  });

  it("exposes each tool to Anthropic with a valid input_schema", () => {
    expect(ANTHROPIC_TOOLS.length).toBe(TOOL_SPECS.length);
    for (const tool of ANTHROPIC_TOOLS) {
      expect(tool.name, "tool needs a name").toBeTruthy();
      expect(tool.description, `${tool.name} needs a description`).toBeTruthy();
      expect(tool.input_schema.type).toBe("object");
      // $schema is stripped: it's dead weight in the prompt-cache prefix.
      expect(tool.input_schema).not.toHaveProperty("$schema");
      // A $ref would be unresolvable — we send no definitions block.
      expect(JSON.stringify(tool.input_schema)).not.toContain('"$ref"');
    }
  });

  it("converts zod shapes to JSON Schema faithfully", () => {
    const listCustomers = ANTHROPIC_TOOLS.find((t) => t.name === "list_customers");
    const schema = listCustomers?.input_schema as {
      properties?: Record<string, { type?: string }>;
    };
    expect(schema.properties?.search?.type).toBe("string");
    expect(schema.properties?.limit?.type).toBe("integer");
  });
});
