/**
 * SEO publish adapters (docs/SEO_AGENCY_PLAN.md, Phase 2) — push an approved
 * article through a connected gateway: Git (GitHub), WordPress, Sanity, Payload,
 * or a custom REST/GraphQL endpoint. Server-only (decrypts credentials + makes
 * outbound calls). Credentials are decrypted here and never returned.
 */
import { marked } from "marked";
import { decryptSecret } from "@/lib/crypto";
import { CONNECTORS_BY_ID } from "@/lib/seo/connectors";

interface Article {
  title: string;
  slug: string;
  description: string;
  markdown: string;
  html: string;
  keyword: string;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}

/** Pull a meta description from the seo_metadata artifact, else first paragraph. */
function deriveDescription(seoMeta: string | undefined, markdown: string): string {
  if (seoMeta) {
    const m = seoMeta.match(/##\s*Meta Description[^\n]*\n+([^\n]+)/i);
    if (m) return m[1].replace(/^[()`*\s]+|[()`*\s]+$/g, "").slice(0, 160);
  }
  const firstPara = markdown.split("\n").find((l) => l.trim() && !l.trim().startsWith("#"));
  return (firstPara ?? "").replace(/[#*_`>]/g, "").trim().slice(0, 160);
}

function stripLeadingH1(md: string): string {
  return md.replace(/^\s*#\s+.*\n+/, "");
}

/** Fill {{title}} / {{slug}} / {{description}} / {{html}} / {{markdown}} /
 *  {{keyword}} in a JSON template, JSON-escaping each value so the result parses. */
function fillTemplate(tpl: string, a: Article): string {
  const esc = (v: string) => JSON.stringify(v).slice(1, -1);
  return tpl
    .replace(/\{\{title\}\}/g, esc(a.title))
    .replace(/\{\{slug\}\}/g, esc(a.slug))
    .replace(/\{\{description\}\}/g, esc(a.description))
    .replace(/\{\{html\}\}/g, esc(a.html))
    .replace(/\{\{markdown\}\}/g, esc(a.markdown))
    .replace(/\{\{keyword\}\}/g, esc(a.keyword));
}

type Meta = Record<string, string>;
type Secrets = Record<string, string>;
interface PublishResult { url: string | null; ref?: string }

// ── Adapters ─────────────────────────────────────────────────────────────────

async function publishGitHub(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  const [owner, repo] = (meta.repo ?? "").split("/");
  if (!owner || !repo) throw new Error("Repository must be owner/repo");
  const branch = meta.branch || "main";
  const ext = meta.extension || "md";
  const path = `${(meta.content_path || "").replace(/\/+$/, "")}/${a.slug}.${ext}`.replace(/^\/+/, "");
  const today = new Date().toISOString().split("T")[0];
  const file = `---\ntitle: "${a.title.replace(/"/g, '\\"')}"\ndescription: "${a.description.replace(/"/g, '\\"')}"\npubDate: ${today}\ndraft: false\n---\n\n${stripLeadingH1(a.markdown)}\n`;

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Authorization: `Bearer ${secrets.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Kirei-SEO",
    "Content-Type": "application/json",
  };
  // Existing file? need its sha to update.
  let sha: string | undefined;
  const head = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (head.ok) { const j = await head.json(); sha = j.sha; }
  const res = await fetch(api, {
    method: "PUT", headers,
    body: JSON.stringify({ message: `Add ${a.title}`, content: Buffer.from(file, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { url: j.content?.html_url ?? null };
}

async function publishWordPress(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  const base = (meta.site_url ?? "").replace(/\/+$/, "");
  const auth = Buffer.from(`${meta.username}:${secrets.app_password}`).toString("base64");
  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: a.title, content: a.html, slug: a.slug, status: meta.status || "draft", excerpt: a.description }),
  });
  if (!res.ok) throw new Error(`WordPress ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { url: j.link ?? null, ref: String(j.id ?? "") };
}

async function publishSanity(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  const api = `https://${meta.project_id}.api.sanity.io/v${meta.api_version || "2024-01-01"}/data/mutate/${meta.dataset || "production"}`;
  const res = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${secrets.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations: [{ create: {
      _type: meta.doc_type || "post", title: a.title, slug: { _type: "slug", current: a.slug },
      description: a.description, body: stripLeadingH1(a.markdown),
    } }] }),
  });
  if (!res.ok) throw new Error(`Sanity ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const id = j.results?.[0]?.id ?? j.documentIds?.[0];
  return { url: null, ref: id ? `${meta.project_id}/${meta.dataset || "production"}:${id}` : undefined };
}

async function publishPayload(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  const base = (meta.base_url ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/${meta.collection}`, {
    method: "POST",
    headers: { Authorization: `users API-Key ${secrets.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: a.title, slug: a.slug, content: a.html, description: a.description }),
  });
  if (!res.ok) throw new Error(`Payload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { url: j.doc?.url ?? null, ref: String(j.doc?.id ?? j.id ?? "") };
}

async function publishRest(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  let body: unknown;
  try { body = JSON.parse(fillTemplate(meta.body_template ?? "{}", a)); }
  catch { throw new Error("REST body template is not valid JSON after filling placeholders"); }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (meta.auth_header && secrets.auth_value) headers[meta.auth_header] = secrets.auth_value;
  const res = await fetch(meta.endpoint, { method: meta.method || "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json().catch(() => ({}));
  return { url: j.url ?? j.link ?? null, ref: j.id ? String(j.id) : undefined };
}

async function publishGraphql(meta: Meta, secrets: Secrets, a: Article): Promise<PublishResult> {
  let variables: unknown;
  try { variables = JSON.parse(fillTemplate(meta.variables_template ?? "{}", a)); }
  catch { throw new Error("GraphQL variables template is not valid JSON after filling placeholders"); }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (meta.auth_header && secrets.auth_value) headers[meta.auth_header] = secrets.auth_value;
  const res = await fetch(meta.endpoint, { method: "POST", headers, body: JSON.stringify({ query: meta.mutation, variables }) });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`GraphQL: ${j.errors[0]?.message ?? "error"}`);
  return { url: null, ref: "ok" };
}

const ADAPTERS: Record<string, (m: Meta, s: Secrets, a: Article) => Promise<PublishResult>> = {
  "git-github": publishGitHub,
  wordpress: publishWordPress,
  sanity: publishSanity,
  payload: publishPayload,
  rest: publishRest,
  graphql: publishGraphql,
};

/** Publish an approved content piece through a connection. Owns all writes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishContent(sb: any, args: { businessId: string; pieceId: string; connectionId: string }): Promise<{ url: string | null; ref?: string }> {
  const { data: piece } = await sb.from("seo_content_pieces").select("*").eq("id", args.pieceId).eq("business_id", args.businessId).maybeSingle();
  if (!piece) throw new Error("Content piece not found");
  const artifacts = piece.artifacts ?? {};
  const markdown = artifacts.final?.content ?? artifacts.optimized?.content ?? artifacts.humanized?.content ?? artifacts.draft?.content;
  if (!markdown) throw new Error("No finished content to publish yet — run the pipeline first.");

  const { data: conn } = await sb.from("seo_connections").select("id, provider, meta, secret").eq("id", args.connectionId).eq("business_id", args.businessId).maybeSingle();
  if (!conn) throw new Error("Connection not found");
  const def = CONNECTORS_BY_ID[conn.provider];
  const adapter = ADAPTERS[conn.provider];
  if (!adapter) throw new Error(`No publisher for "${conn.provider}"`);

  let secrets: Secrets = {};
  if (conn.secret) { try { secrets = JSON.parse(decryptSecret(conn.secret)); } catch { throw new Error("Could not read the connection credentials (encryption key changed?)"); } }

  const title = piece.title || piece.topic || "Untitled";
  const article: Article = {
    title, slug: slugify(title),
    description: deriveDescription(artifacts.seo_metadata?.content, markdown),
    markdown, html: await marked.parse(stripLeadingH1(markdown)),
    keyword: piece.target_keyword || piece.topic || "",
  };

  try {
    const result = await adapter(conn.meta ?? {}, secrets, article);
    await sb.from("seo_content_pieces").update({ status: "published", pipeline_status: "done", published_url: result.url ?? result.ref ?? null }).eq("id", args.pieceId);
    await sb.from("seo_job_events").insert({ business_id: args.businessId, site_id: piece.site_id, level: "success", message: `Published "${title}" → ${def?.name ?? conn.provider}${result.url ? ` · ${result.url}` : ""}` });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("seo_job_events").insert({ business_id: args.businessId, site_id: piece.site_id, level: "error", message: `Publish to ${def?.name ?? conn.provider} failed — ${msg}` });
    throw e;
  }
}
