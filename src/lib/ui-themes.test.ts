import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UI_THEMES, UI_THEME_KEYS, LIGHT_THEMES, isUiTheme } from "./ui-themes";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Every `--token:` declared inside one theme's block. */
function tokensOf(theme: string): Set<string> {
  const start = css.indexOf(`[data-theme="${theme}"] {`);
  if (start === -1) return new Set();
  const end = css.indexOf("\n}", start);
  return new Set(
    [...css.slice(start, end).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
  );
}

describe("theme palettes", () => {
  it("gives every theme in the picker a block in globals.css", () => {
    // A theme listed but not styled is selectable, saved, and then renders as
    // whatever the previous theme was — the picker lies about what's applied.
    for (const t of UI_THEMES) {
      expect(css, `no [data-theme="${t.key}"] block`).toContain(`[data-theme="${t.key}"] {`);
    }
  });

  it("declares the same token set in every theme", () => {
    // A token defined in three palettes and missed in the fourth inherits
    // whatever :root left behind — usually an invisible-on-invisible colour,
    // and only on the one theme nobody tested.
    const reference = tokensOf("Midnight");
    expect(reference.size).toBeGreaterThan(30);
    for (const t of UI_THEMES) {
      if (t.key === "Midnight") continue;
      const missing = [...reference].filter((tok) => !tokensOf(t.key).has(tok));
      expect(missing, `${t.key} is missing`).toEqual([]);
    }
  });

  it("keeps the accent distinct from the success colour", () => {
    // Studio's accent IS lime. If --ok were lime too, every status pill would
    // be the brand colour and "paid" would stop reading as good news.
    const block = css.slice(css.indexOf('[data-theme="Studio"] {'));
    const val = (tok: string) => block.match(new RegExp(`${tok}:\\s*([^;]+);`))?.[1].trim();
    expect(val("--ok")).not.toBe(val("--primary"));
  });

  it("agrees with itself about which themes are light", () => {
    expect(LIGHT_THEMES).toEqual(UI_THEMES.filter((t) => !t.dark).map((t) => t.key));
    expect(UI_THEME_KEYS).toEqual(UI_THEMES.map((t) => t.key));
  });

  it("rejects anything not in the list", () => {
    expect(isUiTheme("Studio")).toBe(true);
    expect(isUiTheme("studio")).toBe(false);
    expect(isUiTheme(null)).toBe(false);
  });
});
