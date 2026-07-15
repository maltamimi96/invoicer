"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { importProspects } from "@/lib/actions/prospects";

const FIELDS = ["name", "email", "phone", "company", "title", "website", "source", "notes"] as const;
const TARGETS = [...FIELDS, "custom", "ignore"] as const;
type Target = (typeof TARGETS)[number];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function guess(header: string): Target {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (h.includes("email") || h.includes("mail")) return "email";
  if (h.includes("phone") || h.includes("mobile") || h.includes("tel")) return "phone";
  if (h.includes("company") || h.includes("organisation") || h.includes("organization") || h.includes("business")) return "company";
  if (h.includes("title") || h.includes("role") || h.includes("position")) return "title";
  if (h.includes("web") || h.includes("url") || h.includes("site")) return "website";
  if (h === "name" || h.includes("fullname") || h.includes("contact")) return "name";
  if (h.includes("source")) return "source";
  if (h.includes("note")) return "notes";
  return "custom";
}

const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ProspectsImport({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"csv" | "paste">("csv");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [paste, setPaste] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length < 2) { toast.error("CSV needs a header row + at least one row"); return; }
      setHeaders(parsed[0]); setDataRows(parsed.slice(1).slice(0, 5000)); setMapping(parsed[0].map(guess));
    };
    reader.readAsText(file);
  }

  function rowsFromCsv(): Row[] {
    return dataRows.map((cols) => {
      const p: Row = { custom_fields: {} };
      headers.forEach((h, i) => {
        const target = mapping[i]; const v = (cols[i] ?? "").trim(); if (!v) return;
        if (target === "ignore") return;
        if (target === "custom") p.custom_fields[h] = v;
        else p[target] = v;
      });
      return p;
    }).filter((p) => p.email || p.name);
  }

  function rowsFromPaste(): Row[] {
    return paste.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(.*?)[<(]?([^\s<>()]+@[^\s<>()]+)[>)]?$/);
      if (m) return { name: m[1].replace(/[",]/g, "").trim() || null, email: m[2].trim(), source: "paste" };
      const parts = line.split(",").map((s) => s.trim());
      if (parts.some((p) => p.includes("@"))) return { name: parts[0] || null, email: parts.find((p) => p.includes("@")) ?? null, company: parts[2] ?? null, source: "paste" };
      return { name: line, source: "paste" };
    });
  }

  function doImport() {
    const rows = mode === "csv" ? rowsFromCsv() : rowsFromPaste();
    if (rows.length === 0) { toast.error("Nothing to import"); return; }
    startTransition(async () => {
      try {
        const r = await importProspects(rows);
        toast.success(`Imported ${r.imported}${r.skipped ? `, skipped ${r.skipped} duplicates` : ""}`);
        onOpenChange(false); setHeaders([]); setDataRows([]); setPaste("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Import prospects</DialogTitle></DialogHeader>
        <div className="flex gap-1 mb-3">
          {(["csv", "paste"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-1.5 rounded-md text-sm font-medium", mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{m === "csv" ? "CSV file" : "Paste"}</button>
          ))}
        </div>

        {mode === "csv" ? (
          <div className="space-y-3">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
            {headers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{dataRows.length} rows · map your columns (unmapped “custom” columns are kept on the prospect):</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs flex-1 truncate" title={h}>{h}</span>
                      <select className={selectCls} value={mapping[i]} onChange={(e) => setMapping((prev) => prev.map((m, j) => j === i ? e.target.value as Target : m))}>
                        {TARGETS.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="pi-paste">Paste one per line</Label>
            <Textarea id="pi-paste" rows={8} className="font-mono text-xs" placeholder={"jane@acme.com\nJohn Smith <john@co.com>\nSara, sara@x.com, Acme Co"} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Emails, “Name &lt;email&gt;”, or “name, email, company”. Duplicates are skipped.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={doImport} disabled={isPending}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
