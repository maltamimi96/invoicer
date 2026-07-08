"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plug, Check, Trash2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CONNECTORS, CONNECTORS_BY_ID, type ConnectorDef, type ConnectionView } from "@/lib/seo/connectors";
import { saveConnection, deleteConnection } from "@/lib/actions/seo-connections";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SeoConnections({ siteId, connections }: { siteId: string; connections: ConnectionView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
        router.refresh();
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
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove");
      }
    });
  }

  const publish = CONNECTORS.filter((c) => c.auth === "token");
  const data = CONNECTORS.filter((c) => c.auth === "oauth");

  return (
    <div className="space-y-8">
      {/* Connected */}
      {connections.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Connected</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connections.map((conn) => {
              const def = CONNECTORS_BY_ID[conn.provider];
              return (
                <div key={conn.id} className="rounded-xl border border-emerald-500/40 bg-card p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><Plug className="w-4.5 h-4.5 text-emerald-700" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{conn.label || def?.name || conn.provider}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5"><Check className="w-3 h-3" /> Connected</span>
                    </div>
                    {conn.account_ref && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{conn.account_ref}</p>}
                    <div className="flex gap-2 mt-2">
                      {def && <button onClick={() => openConnect(def, conn)} className="text-xs text-muted-foreground hover:text-foreground underline">Edit</button>}
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
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Publishing gateways</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {publish.map((def) => (
            <div key={def.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Plug className="w-4.5 h-4.5 text-foreground/70" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{def.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                </div>
              </div>
              <div><Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openConnect(def)}>Connect</Button></div>
            </div>
          ))}
        </div>
      </section>

      {/* Data sources (OAuth) */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Data sources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((def) => (
            <div key={def.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Plug className="w-4.5 h-4.5 text-foreground/70" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="text-sm font-semibold">{def.name}</p><span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">OAuth soon</span></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                </div>
              </div>
              <div><Button size="sm" variant="outline" className="text-xs h-7" disabled>Needs Google setup</Button></div>
            </div>
          ))}
        </div>
      </section>

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
