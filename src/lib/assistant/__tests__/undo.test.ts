import { describe, it, expect } from "vitest";
import { TOOL_UNDO, undoSpecFor, targetIdFor, buildChangeEntry, undoLabel } from "../undo";
import { TOOL_SPECS_BY_NAME } from "@/lib/mcp/collect";

describe("undo registry", () => {
  it("only lists tools that actually exist", () => {
    // A typo here means a silently missing Undo button — the log entry would
    // never be written and nothing would say why.
    for (const name of Object.keys(TOOL_UNDO)) {
      expect(TOOL_SPECS_BY_NAME[name], `TOOL_UNDO references unknown tool: ${name}`).toBeDefined();
    }
  });

  it("does not claim to reverse irreversible actions", () => {
    // An Undo button that can't undo is worse than no button.
    for (const name of Object.keys(TOOL_UNDO)) {
      expect(name).not.toMatch(/^send_|charge_|publish_|email_/);
    }
  });

  it("does not offer undo for creates", () => {
    // Reversing a create means deleting a row — a destructive act dressed up
    // as an undo. Left to the user deliberately.
    for (const name of Object.keys(TOOL_UNDO)) {
      expect(name).not.toMatch(/^create_/);
    }
  });

  it("names an id argument each tool actually accepts", () => {
    // The quiet failure this guards against: a wrong idArg means targetIdFor
    // returns null, no change entry is written, and the Undo button simply
    // never appears — with nothing anywhere saying why.
    for (const [name, spec] of Object.entries(TOOL_UNDO)) {
      const shape = TOOL_SPECS_BY_NAME[name]?.shape ?? {};
      const accepts = Object.keys(shape);
      expect(
        accepts.includes(spec.idArg) || accepts.includes("id"),
        `${name}: idArg "${spec.idArg}" is not a parameter of the tool (has: ${accepts.join(", ")})`
      ).toBe(true);
    }
  });

  it("resolves a spec only for registered tools", () => {
    expect(undoSpecFor("delete_customer")).toEqual({
      table: "customers",
      idArg: "customer_id",
      op: "delete",
    });
    expect(undoSpecFor("send_invoice_email")).toBeNull();
    expect(undoSpecFor("nonsense_tool")).toBeNull();
  });
});

describe("targetIdFor", () => {
  const spec = { table: "customers", idArg: "customer_id", op: "update" as const };

  it("reads the id from the tool's own argument", () => {
    expect(targetIdFor(spec, { customer_id: "abc" })).toBe("abc");
  });

  it("falls back to a plain id argument", () => {
    expect(targetIdFor(spec, { id: "xyz" })).toBe("xyz");
  });

  it("returns null when there is no id to snapshot", () => {
    expect(targetIdFor(spec, {})).toBeNull();
    expect(targetIdFor(spec, { customer_id: 42 })).toBeNull();
    expect(targetIdFor(spec, { customer_id: "" })).toBeNull();
  });
});

describe("buildChangeEntry", () => {
  const spec = { table: "customers", idArg: "customer_id", op: "update" as const };

  it("records a reversible change", () => {
    const entry = buildChangeEntry(
      "update_customer",
      spec,
      { id: "1", name: "Old" },
      { id: "1", name: "New" },
      "chg-1"
    );
    expect(entry).toEqual({
      change_id: "chg-1",
      op: "update",
      table: "customers",
      before: { id: "1", name: "Old" },
      after: { id: "1", name: "New" },
      tool: "update_customer",
    });
  });

  it("records nothing when the row was never snapshotted", () => {
    // No 'before' means nothing to restore. Writing an entry anyway would put
    // an Undo button on an action it cannot reverse.
    expect(buildChangeEntry("update_customer", spec, null, { id: "1" }, "chg-2")).toBeNull();
  });
});

describe("undoLabel", () => {
  it("says restore for deletes and undo for updates", () => {
    const base = { change_id: "c", before: {}, after: {}, tool: "t" };
    expect(undoLabel({ ...base, op: "delete", table: "customers" })).toBe("Restore customer");
    expect(undoLabel({ ...base, op: "update", table: "work_orders" })).toBe(
      "Undo change to work order"
    );
  });
});
