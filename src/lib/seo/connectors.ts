/**
 * SEO connector registry — the publishing/data gateways a client site can wire
 * up (docs/SEO_AGENCY_PLAN.md, Phase 2). Each connector declares the config
 * fields the user fills in; fields marked `secret` are encrypted at rest and
 * never leave the server. This registry drives the connect form, the save
 * validation, and (in the publish PR) the adapter dispatch.
 *
 * Plain module — safe to import from client and server.
 */

export type ConnectorFieldType = "text" | "password" | "textarea" | "select";

export interface ConnectorField {
  key: string;
  label: string;
  type: ConnectorFieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  secret?: boolean;          // stored encrypted, never returned to client/MCP
  options?: string[];        // for type: "select"
  default?: string;
}

export interface ConnectorDef {
  id: string;                // stored as seo_connections.provider
  name: string;
  category: "publish" | "data";
  /** token = fill a form (API key/token); oauth = 3-legged flow (separate). */
  auth: "token" | "oauth";
  description: string;
  docsHint?: string;
  fields: ConnectorField[];
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "git-github",
    name: "Git (GitHub)",
    category: "publish",
    auth: "token",
    description: "Commit approved articles as markdown into the site's repo (Astro, Hugo, Eleventy, Next content…).",
    docsHint: "Create a fine-grained token scoped to just this repo with Contents: read & write.",
    fields: [
      { key: "repo", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
      { key: "branch", label: "Branch", type: "text", default: "main", required: true },
      { key: "content_path", label: "Content folder", type: "text", placeholder: "src/content/blog", default: "src/content/blog", required: true },
      { key: "extension", label: "File type", type: "select", options: ["md", "mdx", "mdoc"], default: "md" },
      { key: "frontmatter", label: "Frontmatter template (optional)", type: "textarea", placeholder: 'title: "{{title}}"\ndescription: "{{description}}"\npubDate: {{date}}\ndraft: false', help: 'Match your site\'s content schema. Placeholders: {{title}} {{description}} {{slug}} {{date}} {{keyword}}. Leave blank for a sensible default.' },
      { key: "token", label: "GitHub token", type: "password", secret: true, required: true, help: "Fine-grained PAT, Contents: read/write on this repo only." },
    ],
  },
  {
    id: "wordpress",
    name: "WordPress",
    category: "publish",
    auth: "token",
    description: "Publish to a WordPress site via the REST API.",
    docsHint: "Users → Profile → Application Passwords creates the password.",
    fields: [
      { key: "site_url", label: "Site URL", type: "text", placeholder: "https://example.com", required: true },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "app_password", label: "Application password", type: "password", secret: true, required: true },
      { key: "status", label: "Publish as", type: "select", options: ["draft", "publish"], default: "draft" },
    ],
  },
  {
    id: "sanity",
    name: "Sanity",
    category: "publish",
    auth: "token",
    description: "Create documents in a Sanity dataset via the mutations API (Next.js + Sanity).",
    docsHint: "manage.sanity.io → API → Tokens (Editor/write).",
    fields: [
      { key: "project_id", label: "Project ID", type: "text", required: true },
      { key: "dataset", label: "Dataset", type: "text", default: "production", required: true },
      { key: "api_version", label: "API version", type: "text", default: "2024-01-01" },
      { key: "doc_type", label: "Document type", type: "text", placeholder: "post", default: "post", required: true },
      { key: "token", label: "Write token", type: "password", secret: true, required: true },
    ],
  },
  {
    id: "payload",
    name: "Payload CMS",
    category: "publish",
    auth: "token",
    description: "Create documents in a Payload collection via its REST API (Next.js + Payload).",
    docsHint: "Use an API key from a Payload user with create rights on the collection.",
    fields: [
      { key: "base_url", label: "API base URL", type: "text", placeholder: "https://cms.example.com/api", required: true },
      { key: "collection", label: "Collection slug", type: "text", placeholder: "posts", required: true },
      { key: "api_key", label: "API key", type: "password", secret: true, required: true, help: "Sent as Authorization: <collection>-API-Key <key>." },
    ],
  },
  {
    id: "rest",
    name: "Custom REST API",
    category: "publish",
    auth: "token",
    description: "POST the article to any REST endpoint with a JSON body you map.",
    docsHint: "Use {{title}}, {{slug}}, {{description}}, {{html}}, {{markdown}}, {{keyword}} in the body template.",
    fields: [
      { key: "endpoint", label: "Endpoint URL", type: "text", placeholder: "https://api.example.com/posts", required: true },
      { key: "method", label: "Method", type: "select", options: ["POST", "PUT"], default: "POST" },
      { key: "auth_header", label: "Auth header", type: "text", default: "Authorization", help: "Header name for the secret below." },
      { key: "auth_value", label: "Auth value", type: "password", secret: true, help: "e.g. Bearer <token>. Sent as the auth header." },
      { key: "body_template", label: "JSON body template", type: "textarea", required: true, placeholder: '{ "title": "{{title}}", "content": "{{html}}", "slug": "{{slug}}" }' },
    ],
  },
  {
    id: "graphql",
    name: "Custom GraphQL",
    category: "publish",
    auth: "token",
    description: "Run a GraphQL mutation against any endpoint with variables you map.",
    docsHint: "Use {{title}}, {{slug}}, {{description}}, {{html}}, {{markdown}}, {{keyword}} in the variables template.",
    fields: [
      { key: "endpoint", label: "GraphQL endpoint", type: "text", placeholder: "https://api.example.com/graphql", required: true },
      { key: "mutation", label: "Mutation", type: "textarea", required: true, placeholder: "mutation($input: PostInput!) { createPost(input: $input) { id url } }" },
      { key: "variables_template", label: "Variables (JSON template)", type: "textarea", required: true, placeholder: '{ "input": { "title": "{{title}}", "body": "{{html}}" } }' },
      { key: "auth_header", label: "Auth header", type: "text", default: "Authorization" },
      { key: "auth_value", label: "Auth value", type: "password", secret: true },
    ],
  },
  {
    id: "gsc",
    name: "Google Search Console",
    category: "data",
    auth: "oauth",
    description: "Pull real keyword positions, clicks and impressions. Syncs nightly and fills the rankings table in client reports.",
    docsHint: "Sign in with the Google account that has access to the property — read-only, and we never see your password.",
    // No fields: this is a redirect-to-Google OAuth flow, not a form. The
    // refresh token is stored encrypted by the callback.
    fields: [],
  },
];

export const CONNECTORS_BY_ID: Record<string, ConnectorDef> =
  Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));

/** Field keys that are secret for a connector. */
export function secretFieldKeys(def: ConnectorDef): string[] {
  return def.fields.filter((f) => f.secret).map((f) => f.key);
}

/** A connection as shown to the client — secrets redacted. */
export interface ConnectionView {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  account_ref: string | null;
  connected_at: string | null;
  meta: Record<string, string>;
  hasSecret: boolean;
}
