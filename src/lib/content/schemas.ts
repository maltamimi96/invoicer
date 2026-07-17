/**
 * Forced-output schemas — one per agent.
 *
 * Each agent is given exactly one tool and forced to call it, so the model
 * returns validated structured data instead of prose we have to dig through.
 *
 * The SEO engine instead asks for "ONLY a JSON array" in the prompt and then
 * hunts for the first `[` to the last `]` (`extractJsonArray`, engine.ts:133).
 * That works until the model says one friendly word first, or a `]` appears
 * inside a string — and then the whole run dies with "didn't return usable
 * output". Forced tool-use is the supported mechanism; use it.
 *
 * Plain module — no server imports.
 */

import type { ContentArtifactKey } from "./pipeline";

export interface AgentSchema {
  toolName: string;
  description: string;
  /** JSON Schema for the tool input — what the agent must return. */
  input_schema: Record<string, unknown>;
  /** Artifact key the tool's payload is stored under. */
  artifact: ContentArtifactKey;
}

const str = (description: string) => ({ type: "string", description });

/** One rendered piece of content, per angle x platform. Shared by the later steps. */
const VARIATION = {
  type: "object",
  properties: {
    angle_index: { type: "integer", description: "0-based index of the angle this came from." },
    angle: str("Short label for the angle, e.g. 'storm-season urgency'."),
    platform: {
      type: "string",
      enum: ["instagram", "facebook", "tiktok", "linkedin", "youtube"],
    },
    hook: str("The opening line. Under ~12 words."),
    body: str("The post body or full script text."),
    assets: {
      type: "object",
      description: "Extras that vary by kind: beats, on_screen_text, hashtags, first_comment, cta, title.",
      additionalProperties: true,
    },
  },
  required: ["angle_index", "angle", "platform", "hook", "body"],
  additionalProperties: false,
} as const;

export const AGENT_SCHEMAS: Record<string, AgentSchema> = {
  "topic-scout": {
    toolName: "submit_topics",
    description: "Submit the researched topics. Call this exactly once, with everything you found.",
    artifact: "research",
    input_schema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          minItems: 5,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              title: str("The topic, specific enough to film or write tomorrow."),
              detail: str("Why it's worth doing NOW — the evidence you actually found, not a generality."),
              angle_hint: str("The most promising way in, if one stands out."),
              season: str("When it lands: a month, a season, or 'evergreen'."),
              source_urls: {
                type: "array",
                items: { type: "string" },
                description: "URLs you actually used. Don't invent these.",
              },
              priority: { type: "integer", minimum: 1, maximum: 10 },
            },
            required: ["title", "detail", "priority"],
            additionalProperties: false,
          },
        },
      },
      required: ["topics"],
      additionalProperties: false,
    },
  },

  "angle-strategist": {
    toolName: "submit_angles",
    description: "Submit the creative angles. Exactly the number requested, all genuinely different.",
    artifact: "angles",
    input_schema: {
      type: "object",
      properties: {
        angles: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              label: str("Short handle, e.g. 'the one about the money'."),
              who: str("The specific person this is for."),
              emotion: str("What they feel in the second before they stop scrolling."),
              moment: str("The moment it speaks to."),
              rationale: str("Why this is a different video, not the same one reworded."),
              service: str("The service it points at."),
            },
            required: ["label", "who", "emotion", "rationale"],
            additionalProperties: false,
          },
        },
      },
      required: ["angles"],
      additionalProperties: false,
    },
  },

  "hook-writer": {
    toolName: "submit_hooks",
    description: "Submit one hook per angle, plus alternates.",
    artifact: "hooks",
    input_schema: {
      type: "object",
      properties: {
        hooks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle_index: { type: "integer" },
              hook: str("Your recommendation. Under ~12 words."),
              alternates: { type: "array", items: { type: "string" } },
            },
            required: ["angle_index", "hook"],
            additionalProperties: false,
          },
        },
      },
      required: ["hooks"],
      additionalProperties: false,
    },
  },

  "script-writer": {
    toolName: "submit_scripts",
    description: "Submit one short-form video script per angle.",
    artifact: "draft",
    input_schema: {
      type: "object",
      properties: {
        scripts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle_index: { type: "integer" },
              hook: str("Said out loud in the first second."),
              beats: {
                type: "array",
                description: "Shots in order. Each must be physically gettable on a phone, on site.",
                items: {
                  type: "object",
                  properties: {
                    shot: str("What the camera points at."),
                    vo: str("What they say over it."),
                    on_screen: str("On-screen text. Short — most watch on mute."),
                    seconds: { type: "number" },
                  },
                  required: ["shot", "vo"],
                  additionalProperties: false,
                },
              },
              cta: str("One CTA. Not three."),
            },
            required: ["angle_index", "hook", "beats", "cta"],
            additionalProperties: false,
          },
        },
      },
      required: ["scripts"],
      additionalProperties: false,
    },
  },

  "caption-writer": {
    toolName: "submit_posts",
    description: "Submit one post per angle.",
    artifact: "draft",
    input_schema: {
      type: "object",
      properties: {
        posts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle_index: { type: "integer" },
              hook: str("The opening line."),
              body: str("The post itself."),
              caption: str("Shorter version for image-led platforms."),
              hashtags: { type: "array", items: { type: "string" }, description: "5-8, local and real." },
              first_comment: str("Where the link goes, if there is one."),
              cta: str("One CTA."),
            },
            required: ["angle_index", "hook", "body"],
            additionalProperties: false,
          },
        },
      },
      required: ["posts"],
      additionalProperties: false,
    },
  },

  "brand-voice-guardian": {
    toolName: "submit_voiced",
    description: "Submit the same pieces, rewritten in the client's voice.",
    artifact: "voiced",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle_index: { type: "integer" },
              hook: str("The hook, in their voice."),
              body: str("The content, in their voice. Same facts."),
              assets: { type: "object", additionalProperties: true },
              changed: str("What you changed and why. Brief."),
            },
            required: ["angle_index", "hook", "body"],
            additionalProperties: false,
          },
        },
        banned_hits: {
          type: "array",
          items: { type: "string" },
          description: "Banned phrases you found and removed.",
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },

  "platform-adapter": {
    toolName: "submit_variations",
    description:
      "Submit one render for EVERY angle x platform combination requested. No gaps, no extras, no two identical bodies.",
    artifact: "adapted",
    input_schema: {
      type: "object",
      properties: {
        variations: { type: "array", items: VARIATION },
      },
      required: ["variations"],
      additionalProperties: false,
    },
  },

  "editor-compliance": {
    toolName: "submit_review",
    description: "Submit every piece, corrected where needed, plus your flags.",
    artifact: "final",
    input_schema: {
      type: "object",
      properties: {
        variations: { type: "array", items: VARIATION },
        flags: {
          type: "array",
          description: "Claims that need backing, or facts you couldn't verify.",
          items: {
            type: "object",
            properties: {
              angle_index: { type: "integer" },
              platform: { type: "string" },
              claim: str("The claim, quoted."),
              issue: str("Why it needs backing."),
              severity: { type: "string", enum: ["note", "warning", "blocker"] },
            },
            required: ["claim", "issue", "severity"],
            additionalProperties: false,
          },
        },
      },
      required: ["variations"],
      additionalProperties: false,
    },
  },
};
