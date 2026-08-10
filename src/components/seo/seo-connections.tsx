"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, GithubLogo } from "@/components/ui/icons";
import { ConnectorIcon } from "@/components/seo/connector-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CONNECTORS, CONNECTORS_BY_ID, type ConnectorDef, type ConnectionView } from "@/lib/seo/connectors";
import {
  saveConnection, deleteConnection, testSeoConnection,
  getGithubConnectUrl, listGithubRepos, finalizeGithubConnection,
  getGscConnectUrl, listGscProperties, finalizeGscConnection,
} from "@/lib/actions/seo-connections";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

interface Props {
  siteId: string;
  connections: ConnectionView[];
  /** Server has a GitHub App configured → show the one-click path. */
  githubAppReady?: boolean;
  /** Outcome of a GitHub round trip, from the callback's query string. */
  githubStatus?: string | null;
  /** Signed state carrying the installation, when a repo still needs picking. */
  ghToken?: string | null;
  /** Server has a Google OAuth client + encryption key configured. */
  gscReady?: boolean;
  /** Outcome of a Google round trip, from the callback's query string. */
  gscStatus?: string | null;
  /** Signed state carrying the Google credentials, when a property needs picking. */
  gscToken?: string | null;
  /** Best-guess property to pre-select in the picker. */
  gscGuess?: string | null;
}

const GH_MESSAGES: Record<string, { ok: boolean; msg: string }> = {
  connected: { ok: true, msg: "GitHub connected" },
  cancelled: { ok: false, msg: "GitHub connect was cancelled" },
  expired: { ok: false, msg: "That connect link expired — try again" },
  auth: { ok: false, msg: "Sign in again to finish connecting GitHub" },
  site: { ok: false, msg: "That site isn't in the active business" },
  norepos: { ok: false, msg: "No repositories were granted — reconnect and pick one" },
  unconfigured: { ok: false, msg: "The GitHub App isn't set up on this server yet" },
};

const GSC_MESSAGES: Record<string, { ok: boolean; msg: string }> = {
  connected: { ok: true, msg: "Search Console connected" },
  cancelled: { ok: false, msg: "Google connect was cancelled" },
  expired: { ok: false, msg: "That connect link expired — try again" },
  auth: { ok: false, msg: "Sign in again to finish connecting Google" },
  site: { ok: false, msg: "That site isn't in the active business" },
  noprops: { ok: false, msg: "That Google account has no Search Console properties" },
  unconfigured: { ok: false, msg: "Search Console isn't set up on this server yet" },
};

export function SeoConnections({
  siteId, connections, githubAppReady, githubStatus, ghToken,
  gscReady, gscStatus, gscToken, gscGuess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [editing, setEditing] = useState<{ def: ConnectorDef; conn?: ConnectionView } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function openConnect(def: ConnectorDef, conn?: ConnectionView) {
    const v: Record<string, string> = {};
    for (const f of def.fields) v[f.key] = f.secret ? "" : (conn?.meta?.[f.key] ?? f.default ?? "");
    setValues(v);
    setEditing({ def, conn });
  }

  function handleSave() {
    if (!editing) return;
    startTransition(async () => {
      try {
        await saveConnection({ site_id: siteId, provider: editing.def.id, values, connection_id: editing.conn?.id });
        toast.success(`${editing.def.name} ${editing.conn ? "updated" : "connected"}`);
        setEditing(null);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save connection");
      }
    });
  }

  function handleDelete(conn: ConnectionView) {
    startTransition(async () => {
      try {
        await deleteConnection(conn.id, siteId);
        toast.success("Connection removed");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove");
      }
    });
  }

  // ── GitHub App flow ────────────────────────────────────────────────────────
  const [connectingGh, setConnectingGh] = useState(false);
  const [picker, setPicker] = useState<{ repos: { full_name: string; default_branch: string; private: boolean }[]; repo: string; contentPath: string } | null>(null);
  const handled = useRef(false);

  /** Report the outcome of a GitHub round trip once, then drop the query
   *  params so a refresh doesn't replay the toast. */
  useEffect(() => {
    if (!githubStatus || handled.current) return;
    handled.current = true;
    const known = GH_MESSAGES[githubStatus];
    if (known) (known.ok ? toast.success : toast.error)(known.msg);
    else if (githubStatus === "error") toast.error("GitHub connect failed");

    if (githubStatus === "pick" && ghToken) {
      listGithubRepos(ghToken)
        .then((repos) => setPicker({ repos, repo: repos[0]?.full_name ?? "", contentPath: "src/content/blog" }))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't list repositories"));
    } else {
      router.replace(`/seo/${siteId}`, { scroll: false });
      if (known?.ok) refresh();
    }
  }, [githubStatus, ghToken, router, siteId]);

  function handleConnectGithub() {
    setConnectingGh(true);
    getGithubConnectUrl(siteId)
      .then((url) => { window.location.href = url; })
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't start GitHub connect"); setConnectingGh(false); });
  }

  function handlePickRepo() {
    if (!picker || !ghToken || !picker.repo) return;
    startTransition(async () => {
      try {
        await finalizeGithubConnection({ token: ghToken, repo: picker.repo, content_path: picker.contentPath });
        toast.success("GitHub connected");
        setPicker(null);
        router.replace(`/seo/${siteId}`, { scroll: false });
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't connect that repository");
      }
    });
  }

  // ── Google Search Console (OAuth) ──────────────────────────────────────────
  const [connectingGsc, setConnectingGsc] = useState(false);
  const [gscPicker, setGscPicker] = useState<{ props: { siteUrl: string; permissionLevel: string }[]; siteUrl: string } | null>(null);
  const gscHandled = useRef(false);

  useEffect(() => {
    if (!gscStatus || gscHandled.current) return;
    gscHandled.current = true;
    const known = GSC_MESSAGES[gscStatus];
    if (known) (known.ok ? toast.success : toast.error)(known.msg);
    else if (gscStatus === "error") toast.error("Search Console connect failed");

    if (gscStatus === "pick" && gscToken) {
      listGscProperties(gscToken)
        .then((props) => setGscPicker({ props, siteUrl: gscGuess || props[0]?.siteUrl || "" }))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't list properties"));
    } else {
      router.replace(`/seo/${siteId}`, { scroll: false });
      if (known?.ok) refresh();
    }
  }, [gscStatus, gscToken, gscGuess, router, siteId]);

  function handleConnectGsc() {
    setConnectingGsc(true);
    getGscConnectUrl(siteId)
      .then((url) => { window.location.href = url; })
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't start Google connect"); setConnectingGsc(false); });
  }

  function handlePickProperty() {
    if (!gscPicker || !gscToken || !gscPicker.siteUrl) return;
    startTransition(async () => {
      try {
        await finalizeGscConnection({ token: gscToken, site_url: gscPicker.siteUrl });
        toast.success("Search Console connected");
        setGscPicker(null);
        router.replace(`/seo/${siteId}`, { scroll: false });
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't connect that property");
      }
    });
  }

  const [testingId, setTestingId] = useState<string | null>(null);
  function handleTest(conn: ConnectionView) {
    setTestingId(conn.id);
    testSeoConnection(conn.id)
      .then((r) => r.ok ? toast.success(r.message) : toast.error(r.message))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Test failed"))
      .finally(() => setTestingId(null));
  }

  // Don't re-offer what's already wired up — a connected gateway used to show
  // in "Connected" AND still render a live Connect button below it.
  const connectedProviders = new Set(connections.map((c) => c.provider));
  const available = CONNECTORS
    .filter((c) => !connectedProviders.has(c.id))
    // Named integrations first; Custom REST/GraphQL are escape hatches and
    // shouldn't carry the same weight as WordPress.
    .sort((a, b) => Number(a.advanced ?? false) - Number(b.advanced ?? false));
  const publish = available.filter((c) => c.category === "publish");
  const data = available.filter((c) => c.category === "data");

  /** One card shape for every connector. What used to be `isGithub` / `isGsc`
   *  ternaries is now driven by def.oneClick + def.icon, so adding the next
   *  one-click provider needs no change here. */
  function GatewayCard({ def }: { def: ConnectorDef }) {
    const oneClickReady = def.id === "git-github" ? githubAppReady : def.id === "gsc" ? gscReady : false;
    const busy = def.id === "git-github" ? connectingGh : def.id === "gsc" ? connectingGsc : false;
    const start = def.id === "git-github" ? handleConnectGithub : handleConnectGsc;
    // GitHub keeps its manual-token path (Enterprise / no App); GSC has no
    // form to fall back to — it's OAuth or nothing.
    const hasTokenFallback = def.fields.length > 0;

    return (
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <ConnectorIcon name={def.icon} className="w-4.5 h-4.5 text-foreground/70" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold">{def.name}</p>
              {def.oneClick && <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">1-click</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
          </div>
        </div>

        {def.oneClick ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="text-xs h-7" onClick={start} disabled={!oneClickReady || busy}>
              <ConnectorIcon name={def.icon} className="w-3.5 h-3.5 mr-1.5" />
              {busy ? "Opening…" : `Connect ${def.id === "gsc" ? "Google" : "GitHub"}`}
            </Button>
            {hasTokenFallback && (
              <button onClick={() => openConnect(def)} className="text-xs text-muted-foreground hover:text-foreground underline">
                Use a token instead
              </button>
            )}
            {!oneClickReady && (
              <p className="text-[11px] text-muted-foreground basis-full">
                {hasTokenFallback
                  ? "One-click needs the GitHub App configured on the server — use a token for now."
                  : "Needs a Google OAuth client + APP_ENCRYPTION_KEY on the server."}
              </p>
            )}
          </div>
        ) : (
          <div><Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openConnect(def)}>Connect</Button></div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Connected */}
      {connections.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Connected <span className="text-muted-foreground/60">({connections.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connections.map((conn) => {
              const def = CONNECTORS_BY_ID[conn.provider];
              return (
                <div key={conn.id} className="rounded-xl border border-emerald-500/40 bg-card p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <ConnectorIcon name={def?.icon ?? conn.provider} className="w-4.5 h-4.5 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{conn.label || def?.name || conn.provider}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5"><Check className="w-3 h-3" /> Connected</span>
                    </div>
                    {conn.account_ref && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{conn.account_ref}</p>}
                    {conn.meta?.installation_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 mt-1">
                        <GithubLogo className="w-3 h-3" /> via GitHub App
                      </span>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleTest(conn)} disabled={testingId === conn.id} className="text-xs text-muted-foreground hover:text-foreground underline">{testingId === conn.id ? "Testing…" : "Test"}</button>
                      {/* OAuth connectors have no editable fields — reconnect instead. */}
                      {def && def.auth === "token" && <button onClick={() => openConnect(def, conn)} className="text-xs text-muted-foreground hover:text-foreground underline">Edit</button>}
                      <button onClick={() => handleDelete(conn)} disabled={isPending} className="text-xs text-muted-foreground hover:text-destructive underline">Remove</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Publishing gateways */}
      {/* Nothing to offer once everything's wired up — don't render an empty grid. */}
      {publish.length > 0 && (
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Publish to</h3>
        <p className="text-xs text-muted-foreground mb-3">Where approved articles get pushed. Connect one.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {publish.map((def) => <GatewayCard key={def.id} def={def} />)}
        </div>
      </section>
      )}

      {/* Data sources (OAuth) */}
      {data.length > 0 && (
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pull data from</h3>
        <p className="text-xs text-muted-foreground mb-3">Real ranking data — feeds the Search performance tab and client reports.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((def) => <GatewayCard key={def.id} def={def} />)}
        </div>
      </section>
      )}

      {/* Everything connected — say so rather than showing two empty grids. */}
      {publish.length === 0 && data.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Check className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold">Everything&apos;s connected</p>
          <p className="text-xs text-muted-foreground mt-1">This site is wired up to every available gateway and data source.</p>
        </div>
      )}

      {/* Repo picker — shown when the GitHub App was granted several repos */}
      <Dialog open={!!picker} onOpenChange={(o) => { if (!o) { setPicker(null); router.replace(`/seo/${siteId}`, { scroll: false }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pick a repository</DialogTitle></DialogHeader>
          {picker && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">The GitHub App has access to {picker.repos.length} repositories. Choose where articles should be committed.</p>
              <div className="space-y-1.5">
                <Label htmlFor="gh-repo">Repository</Label>
                <select id="gh-repo" className={selectCls} value={picker.repo} onChange={(e) => setPicker((p) => p && { ...p, repo: e.target.value })}>
                  {picker.repos.map((r) => <option key={r.full_name} value={r.full_name}>{r.full_name}{r.private ? " (private)" : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gh-path">Content folder</Label>
                <Input id="gh-path" value={picker.contentPath} placeholder="src/content/blog" onChange={(e) => setPicker((p) => p && { ...p, contentPath: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">Where markdown files land. The branch defaults to the repo&apos;s default branch — change it later under Edit.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPicker(null); router.replace(`/seo/${siteId}`, { scroll: false }); }} disabled={isPending}>Cancel</Button>
            <Button onClick={handlePickRepo} disabled={isPending || !picker?.repo}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Property picker — when the Google account has several properties */}
      <Dialog open={!!gscPicker} onOpenChange={(o) => { if (!o) { setGscPicker(null); router.replace(`/seo/${siteId}`, { scroll: false }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pick a Search Console property</DialogTitle></DialogHeader>
          {gscPicker && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                That Google account has {gscPicker.props.length} properties. Choose the one for this site — domain
                (<span className="ch-mono">sc-domain:</span>) and URL-prefix properties are different in Search Console.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="gsc-prop">Property</Label>
                <select id="gsc-prop" className={selectCls} value={gscPicker.siteUrl} onChange={(e) => setGscPicker((p) => p && { ...p, siteUrl: e.target.value })}>
                  {gscPicker.props.map((p) => <option key={p.siteUrl} value={p.siteUrl}>{p.siteUrl}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setGscPicker(null); router.replace(`/seo/${siteId}`, { scroll: false }); }} disabled={isPending}>Cancel</Button>
            <Button onClick={handlePickProperty} disabled={isPending || !gscPicker?.siteUrl}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect / edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.conn ? "Edit" : "Connect"} {editing?.def.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.def.docsHint && <p className="text-xs text-muted-foreground">{editing.def.docsHint}</p>}
              {editing.def.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                  {f.type === "textarea" ? (
                    <Textarea id={`f-${f.key}`} rows={3} className="font-mono text-xs" placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
                  ) : f.type === "select" ? (
                    <select id={`f-${f.key}`} className={selectCls} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <Input id={`f-${f.key}`} type={f.type === "password" ? "password" : "text"} placeholder={f.secret && editing.conn?.hasSecret ? "•••••• (leave blank to keep current)" : f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                  {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                </div>
              ))}
              <p className={cn("text-[11px]", "text-muted-foreground")}>Credentials are encrypted at rest and never shown again.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>{editing?.conn ? "Save" : "Connect"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
