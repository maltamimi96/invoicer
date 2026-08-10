"use client";

/**
 * The password vault.
 *
 * The reveal interaction is the whole design. A password is shown only when
 * asked for, is fetched fresh from the server each time (nothing secret sits
 * in component state waiting to be found), and auto-hides after 30 seconds so
 * a walked-away-from screen doesn't leave a client's login on display.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { toast } from "sonner";
import {
  Lock, Plus, Search, Eye, EyeOff, Copy, Trash2, Loader2, ExternalLink,
  Pencil, ClipboardList, RefreshCw,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { useConfirm } from "@/components/ui/confirm";
import {
  saveVaultItem, revealVaultSecret, deleteVaultItem, type VaultLogEntry,
} from "@/lib/actions/vault";
import {
  VAULT_CATEGORIES, categoryLabel, generatePassword, passwordStrength,
  normaliseUrl, type VaultItemView,
} from "@/lib/vault/items";

/** How long a revealed password stays on screen. */
const HIDE_AFTER_MS = 30_000;

interface Props {
  items: VaultItemView[];
  customers: { id: string; name: string }[];
  log: VaultLogEntry[];
  /** False when APP_ENCRYPTION_KEY isn't set — nothing can be stored. */
  ready: boolean;
  /** Fixed client on a customer profile; hides the client picker. */
  lockedCustomerId?: string;
  /** Compact mode for the customer profile tab. */
  embedded?: boolean;
}

export function VaultClient({ items, customers, log, ready, lockedCustomerId, embedded }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<VaultItemView | "new" | null>(null);
  const [showLog, setShowLog] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.title.toLowerCase().includes(q)
      || (i.username ?? "").toLowerCase().includes(q)
      || (i.customer_name ?? "").toLowerCase().includes(q));
  }, [items, query]);

  const remove = async (item: VaultItemView) => {
    if (!(await confirm({
      title: `Delete “${item.title}”?`,
      body: "The password is gone for good — there's no undo and no copy anywhere else.",
    }))) return;
    const res = await deleteVaultItem(item.id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Deleted");
    refresh();
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <PageHeader
          title="Passwords"
          subtitle="Account logins you hold for clients. Encrypted, owner and admin only, every reveal logged."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLog(true)}>
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Access log
              </Button>
              <Button size="sm" onClick={() => setEditing("new")} disabled={!ready}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add password
              </Button>
            </div>
          }
        />
      )}

      {/* Nothing can be stored without a key. Say it once, plainly, instead of
          letting every save fail with a server error. */}
      {!ready && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-destructive">The vault can&rsquo;t store anything yet</p>
            <p className="mt-1 text-muted-foreground">
              It needs <code className="font-mono text-xs">APP_ENCRYPTION_KEY</code> (64 hex characters)
              set on the server. Until then nothing is saved — deliberately, rather than
              falling back to storing passwords in plain text.
            </p>
          </CardContent>
        </Card>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setEditing("new")} disabled={!ready}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add password
          </Button>
        </div>
      )}

      {items.length > 4 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username or client…" className="pl-9"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Lock className="mx-auto mb-2 h-7 w-7 opacity-40" />
          {items.length === 0
            ? "No passwords stored yet."
            : "Nothing matches that search."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <VaultRow
              key={item.id} item={item} showClient={!lockedCustomerId}
              onEdit={() => setEditing(item)} onDelete={() => remove(item)}
            />
          ))}
        </div>
      )}

      {editing && (
        <VaultItemDialog
          item={editing === "new" ? null : editing}
          customers={customers}
          lockedCustomerId={lockedCustomerId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      {showLog && <AccessLogDialog log={log} onClose={() => setShowLog(false)} />}
    </div>
  );
}

function VaultRow({
  item, showClient, onEdit, onDelete,
}: { item: VaultItemView; showClient: boolean; onEdit: () => void; onDelete: () => void }) {
  const [secret, setSecret] = useState<{ password: string | null; notes: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-hide. Without this a revealed password stays up until navigation —
  // on a shared or unattended screen that's the whole exposure.
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(() => setSecret(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [secret]);

  const reveal = async () => {
    if (secret) { setSecret(null); return; }
    setBusy(true);
    try {
      // Always fetched fresh — the plaintext is never cached in this component
      // between reveals, so hiding it actually discards it.
      const res = await revealVaultSecret(item.id);
      if (!res.ok) { toast.error(res.error); return; }
      setSecret(res.data);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    setBusy(true);
    try {
      const res = await revealVaultSecret(item.id);
      if (!res.ok) { toast.error(res.error); return; }
      if (!res.data.password) { toast.error("No password stored on this entry"); return; }
      await navigator.clipboard.writeText(res.data.password);
      toast.success("Password copied — it stays on your clipboard until you copy something else");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const href = normaliseUrl(item.url);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium break-words">{item.title}</p>
              <Badge variant="secondary" className="text-xs">{categoryLabel(item.category)}</Badge>
              {showClient && item.customer_name && (
                <Badge variant="outline" className="text-xs">{item.customer_name}</Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.username && <span className="font-mono break-all">{item.username}</span>}
              {href && (
                <a href={href} target="_blank" rel="noreferrer noopener"
                   className="inline-flex items-center gap-1 hover:text-foreground">
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              )}
              {!item.has_password && <span className="italic">notes only</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={copy} disabled={busy || !item.has_password}
                    aria-label={`Copy the password for ${item.title}`}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={reveal} disabled={busy}
                    aria-label={secret ? `Hide the password for ${item.title}` : `Show the password for ${item.title}`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : secret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${item.title}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${item.title}`}
                    className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {secret && (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 p-3">
            {secret.password && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Password</p>
                <p className="font-mono text-sm break-all select-all">{secret.password}</p>
              </div>
            )}
            {secret.notes && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Secure notes</p>
                <p className="whitespace-pre-wrap text-sm break-words select-all">{secret.notes}</p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Hides itself in 30 seconds. This view was recorded in the access log.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VaultItemDialog({
  item, customers, lockedCustomerId, onClose, onSaved,
}: {
  item: VaultItemView | null;
  customers: { id: string; name: string }[];
  lockedCustomerId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState(item?.category ?? "login");
  const [username, setUsername] = useState(item?.username ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [customerId, setCustomerId] = useState(lockedCustomerId ?? item?.customer_id ?? "none");
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);
  const isEdit = Boolean(item);

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveVaultItem(item?.id ?? null, {
        title, category, username, url, password, notes,
        customerId: customerId === "none" ? null : customerId,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(isEdit ? "Saved" : "Stored");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "Add a password"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="v-title">Name</Label>
            <Input id="v-title" value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder="Acme — Meta Business Manager" autoFocus />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="v-cat">Type</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="v-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAULT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!lockedCustomerId && (
              <div>
                <Label htmlFor="v-client">Client</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="v-client"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not a client&rsquo;s — ours</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="v-user">Username or email</Label>
            <Input id="v-user" value={username} onChange={(e) => setUsername(e.target.value)}
                   autoComplete="off" spellCheck={false} />
          </div>

          <div>
            <Label htmlFor="v-url">Web address</Label>
            <Input id="v-url" value={url} onChange={(e) => setUrl(e.target.value)}
                   placeholder="business.facebook.com" autoComplete="off" spellCheck={false} />
          </div>

          <div>
            <Label htmlFor="v-pw">Password</Label>
            <div className="flex gap-2">
              <Input
                id="v-pw"
                // type=text when shown, so the browser doesn't offer to save
                // someone else's password into the operator's own password
                // manager — autoComplete="new-password" is the strongest hint.
                type={showPw ? "text" : "password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "Leave blank to keep the stored one" : ""}
                autoComplete="new-password" spellCheck={false}
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon"
                      onClick={() => { setPassword(generatePassword()); setShowPw(true); }}
                      aria-label="Generate a password">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {password && (
              <p className="mt-1 text-xs text-muted-foreground">
                {strength.label}{strength.hint ? ` — ${strength.hint}` : ""}
              </p>
            )}
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Blank keeps the password that&rsquo;s already stored — it can&rsquo;t be pre-filled here.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="v-notes">Secure notes</Label>
            <Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                      rows={3} placeholder="Recovery codes, security questions, PIN…" />
            <p className="mt-1 text-xs text-muted-foreground">
              Encrypted the same way as the password.
              {isEdit && " Blank keeps what's stored."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save" : "Store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_WORDS: Record<string, string> = {
  reveal: "viewed", create: "added", update: "edited", delete: "deleted",
};

function AccessLogDialog({ log, onClose }: { log: VaultLogEntry[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Access log</DialogTitle></DialogHeader>
        {log.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  <span className="text-muted-foreground">{e.user_email ?? "Someone"}</span>{" "}
                  {ACTION_WORDS[e.action] ?? e.action}{" "}
                  <span className="font-medium">{e.item_title ?? "an entry"}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
