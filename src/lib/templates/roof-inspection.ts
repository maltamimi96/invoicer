import type { ReportSection } from "@/types/database";

export interface SectionTemplate {
  id: string;
  title: string;
  numbering: string;
  placeholder: string;
}

export const ROOF_INSPECTION_SECTIONS: SectionTemplate[] = [
  {
    id: "executive_summary",
    title: "Executive Summary",
    numbering: "1",
    placeholder: "Provide an overview of the inspection findings and overall roof condition...",
  },
  {
    id: "tile_condition",
    title: "Tile Condition",
    numbering: "3.1",
    placeholder: "Describe the condition of roof tiles, including cracking, displacement, missing tiles...",
  },
  {
    id: "biological_contamination",
    title: "Biological Contamination",
    numbering: "3.2",
    placeholder: "Describe presence of moss, lichen, algae or other biological growth...",
  },
  {
    id: "ridge_hip_capping",
    title: "Ridge & Hip Capping",
    numbering: "3.3",
    placeholder: "Describe the condition of ridge and hip cappings, mortar bedding and pointing...",
  },
  {
    id: "valleys_flashings",
    title: "Valleys & Flashings",
    numbering: "3.4",
    placeholder: "Describe valley condition, flashing integrity and any evidence of water ingress...",
  },
  {
    id: "solar_panel_mounting",
    title: "Solar Panel Mounting Interface",
    numbering: "3.5",
    placeholder: "Describe condition of roof around solar panel mounting points and penetrations...",
  },
  {
    id: "structural_assessment",
    title: "Overall Structural Assessment",
    numbering: "3.6",
    placeholder: "Provide overall assessment of structural integrity and any load-bearing concerns...",
  },
];

export function getDefaultSections(): ReportSection[] {
  return ROOF_INSPECTION_SECTIONS.map(({ id, title }) => ({
    id,
    title,
    content: "",
  }));
}

export const SECTION_MAP: Record<string, SectionTemplate> = Object.fromEntries(
  ROOF_INSPECTION_SECTIONS.map((s) => [s.id, s])
);
