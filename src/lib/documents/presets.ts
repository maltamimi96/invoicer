// Ready-made starter templates. Selecting one clones its config into a new
// document_templates row the user can then rename and tweak. Each preset is a
// partial config layered over DEFAULT_TEMPLATE_CONFIG.

import type { TemplateConfig } from "./template-config";
import { DEFAULT_TEMPLATE_CONFIG, DEFAULT_COLUMNS } from "./template-config";

export interface TemplatePreset {
  key: string;
  name: string;
  description: string;
  /** Accent shown on the gallery card. */
  swatch: string;
  config: TemplateConfig;
}

function preset(over: Partial<TemplateConfig>): TemplateConfig {
  return { ...DEFAULT_TEMPLATE_CONFIG, columns: DEFAULT_COLUMNS, ...over };
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "classic-blue",
    name: "Classic Blue",
    description: "Clean two-column layout with a blue accent. The dependable default.",
    swatch: "#2563eb",
    config: preset({ base: "classic", primary_color: "#2563eb", heading_color: "#0f172a" }),
  },
  {
    key: "minimal-mono",
    name: "Minimal Mono",
    description: "Understated black-and-white with a strong rule. Lets the work speak.",
    swatch: "#111827",
    config: preset({
      base: "minimal",
      primary_color: "#111827",
      heading_color: "#111827",
      table_header_bg: "#ffffff",
      font_family: "inter",
    }),
  },
  {
    key: "modern-teal",
    name: "Modern Teal",
    description: "Dark header band with a teal accent — matches the Kirei brand.",
    swatch: "#3a847e",
    config: preset({
      base: "modern",
      primary_color: "#3a847e",
      secondary_color: "#0f2e2b",
      table_header_bg: "#ecf5f4",
      font_family: "inter",
    }),
  },
  {
    key: "bold-header",
    name: "Bold Header",
    description: "Big colour-blocked title bar. Confident and easy to scan.",
    swatch: "#dc2626",
    config: preset({
      base: "modern",
      primary_color: "#dc2626",
      secondary_color: "#1f2937",
      table_header_bg: "#fef2f2",
      font_scale: 1.05,
    }),
  },
  {
    key: "elegant-serif",
    name: "Elegant Serif",
    description: "Serif typography and warm neutrals for a premium, considered feel.",
    swatch: "#7c6f57",
    config: preset({
      base: "classic",
      primary_color: "#7c6f57",
      heading_color: "#3f3a2f",
      muted_color: "#8a8172",
      table_header_bg: "#f7f4ee",
      background_color: "#fffdf9",
      font_family: "lora",
    }),
  },
  {
    key: "trades-bold",
    name: "Trades Bold",
    description: "High-contrast, amber accent, roomy tables. Built for the field.",
    swatch: "#d97706",
    config: preset({
      base: "classic",
      primary_color: "#d97706",
      secondary_color: "#111827",
      heading_color: "#111827",
      table_header_bg: "#fffbeb",
      font_scale: 1.05,
    }),
  },
  {
    key: "letterhead",
    name: "Letterhead",
    description: "Minimal chrome, ready for a full-page background image or watermark.",
    swatch: "#334155",
    config: preset({
      base: "minimal",
      primary_color: "#334155",
      heading_color: "#1e293b",
      show_logo: true,
      watermark_text: null,
      font_family: "merriweather",
    }),
  },
];

export function presetByKey(key: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.key === key);
}
