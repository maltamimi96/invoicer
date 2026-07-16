import { describe, it, expect } from "vitest";
import { invokeTool, toResultBlock } from "../invoke";

/**
 * The image path specifically.
 *
 * MCP and the Messages API disagree on the image block shape — MCP uses
 * {type:"image", data, mimeType}, the API wants
 * {type:"image", source:{type:"base64", media_type, data}}. view_job_photos
 * returns the MCP shape, so a conversion bug here means the assistant silently
 * can't see a work order's photos: no error, just an agent that claims it
 * can't tell.
 */

const ctx = { businessId: "biz", userId: "user", scopes: ["admin"] as const };

describe("invokeTool", () => {
  it("reports an unknown tool rather than throwing", async () => {
    const out = await invokeTool("no_such_tool", {}, { ...ctx, scopes: ["admin"] });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("no such tool");
    // Even errors must be a valid non-empty tool_result body.
    expect(out.content.length).toBeGreaterThan(0);
  });

  it("validates arguments before dispatch", async () => {
    // list_customers takes limit as an int 1..200. The MCP server validates
    // against the zod shape; nothing else would, so this must.
    const out = await invokeTool("list_customers", { limit: 9999 }, { ...ctx, scopes: ["admin"] });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("invalid arguments");
  });

  it("refuses a tool the caller lacks the scope for", async () => {
    const out = await invokeTool("list_customers", {}, { ...ctx, scopes: ["leads:read"] });
    expect(out.isError).toBe(true);
    expect(out.text.toLowerCase()).toContain("scope");
  });

  it("never throws — a bad tool must not take down the turn", async () => {
    await expect(
      invokeTool("list_customers", { limit: "not-a-number" }, { ...ctx, scopes: ["admin"] })
    ).resolves.toBeDefined();
  });
});

describe("toResultBlock — MCP → Messages API", () => {
  it("converts an MCP image block to the API's source shape", () => {
    // view_job_photos emits exactly this shape.
    expect(
      toResultBlock({ type: "image", data: "AAAA", mimeType: "image/jpeg" })
    ).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
    });
  });

  it("passes text through", () => {
    expect(toResultBlock({ type: "text", text: "hi" })).toEqual({ type: "text", text: "hi" });
  });

  it("drops image types the API rejects rather than 400ing the turn", () => {
    // A HEIC straight off an iPhone. Better to lose one photo than the reply.
    expect(toResultBlock({ type: "image", data: "AAAA", mimeType: "image/heic" })).toBeNull();
    expect(toResultBlock({ type: "image", data: "AAAA", mimeType: "" })).toBeNull();
    expect(toResultBlock({ type: "image", data: "AAAA" })).toBeNull();
  });

  it("normalises the mime case", () => {
    expect(
      toResultBlock({ type: "image", data: "A", mimeType: "IMAGE/PNG" })
    ).toMatchObject({ source: { media_type: "image/png" } });
  });

  it("drops anything unrecognised instead of passing it through", () => {
    expect(toResultBlock({ type: "resource", uri: "x" })).toBeNull();
    expect(toResultBlock(null)).toBeNull();
    expect(toResultBlock("plain string")).toBeNull();
  });
});
