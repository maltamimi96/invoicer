"use client";

import { useState, useRef } from "react";
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, X, FileText } from "@/components/ui/icons";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "string" | "number";
}

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ColumnDef[];
  onImport: (rows: Record<string, string | number | null>[]) => Promise<{ imported: number; errors: string[] }>;
  onSuccess: (count: number) => void;
}

// Simple CSV parser that handles quoted fields
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

function buildTemplateCSV(columns: ColumnDef[]): string {
  const header = columns.map((c) => c.label).join(",");
  const example = columns.map((c) => {
    if (c.type === "number") return c.key === "unit_price" ? "99.99" : c.key === "tax_rate" ? "20" : "0";
    if (c.key === "email") return "example@email.com";
    if (c.key === "phone") return "+44 7700 000000";
    if (c.key === "name") return "Example Name";
    return "";
  }).join(",");
  return `${header}\n${example}\n`;
}

function downloadTemplate(columns: ColumnDef[], filename: string) {
  const csv = buildTemplateCSV(columns);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Step = "upload" | "preview" | "result";

interface ParsedRow {
  data: Record<string, string | number | null>;
  errors: string[];
}

export function BulkImportModal({ open, onOpenChange, title, columns, onImport, onSuccess }: BulkImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setParsedRows([]);
    setFilename("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const allRows = parseCSV(text);
      if (allRows.length < 2) { toast.error("CSV must have a header row and at least one data row"); return; }

      const header = allRows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const dataRows = allRows.slice(1);

      // Map header cols to our column defs by matching label or key
      const colIndexMap: Record<string, number> = {};
      for (const col of columns) {
        const idx = header.findIndex(
          (h) => h === col.key.toLowerCase() || h === col.label.toLowerCase().replace(/\s+/g, "_")
        );
        colIndexMap[col.key] = idx;
      }

      const rows: ParsedRow[] = dataRows.map((cells, i) => {
        const data: Record<string, string | number | null> = {};
        const errors: string[] = [];

        for (const col of columns) {
          const idx = colIndexMap[col.key];
          const raw = idx >= 0 ? (cells[idx] ?? "").trim() : "";

          if (col.required && !raw) {
            errors.push(`${col.label} is required`);
            data[col.key] = null;
          } else if (col.type === "number") {
            const n = raw === "" ? 0 : Number(raw);
            if (raw !== "" && isNaN(n)) errors.push(`${col.label} must be a number`);
            data[col.key] = isNaN(n) ? null : n;
          } else {
            data[col.key] = raw || null;
          }
        }

        return { data, errors };
      });

      setParsedRows(rows);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidRows = parsedRows.filter((r) => r.errors.length > 0);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await onImport(validRows.map((r) => r.data));
      setResult(res);
      setStep("result");
      if (res.imported > 0) onSuccess(res.imported);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                Download the template CSV to see the expected format
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => downloadTemplate(columns, `${title.toLowerCase().replace(/\s+/g, "-")}-template.csv`)}
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </Button>
            </div>

            <div
              className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm">Click to upload a CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">Columns: {columns.map((c) => c.label).join(", ")}</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Required columns: {columns.filter((c) => c.required).map((c) => c.label).join(", ")}</p>
              <p>Optional: {columns.filter((c) => !c.required).map((c) => c.label).join(", ")}</p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground truncate">{filename}</span>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <Badge className="bg-green-100 text-green-800 border-green-200">{validRows.length} valid</Badge>
                {invalidRows.length > 0 && <Badge variant="destructive">{invalidRows.length} errors</Badge>}
              </div>
            </div>

            <ScrollArea className="h-64 border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-left font-medium text-muted-foreground">{c.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr key={i} className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2 max-w-[120px] truncate">
                          {row.data[c.key] != null ? String(row.data[c.key]) : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {row.errors.length === 0
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          : <span className="text-red-600 text-xs">{row.errors.join(", ")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {invalidRows.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Rows with errors will be skipped. Fix them in your file and re-import if needed.</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>
                <X className="w-3.5 h-3.5 mr-1.5" />Change file
              </Button>
              <Button size="sm" onClick={handleImport} disabled={importing || validRows.length === 0}>
                {importing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                Import {validRows.length} row{validRows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-400">
                  {result.imported} record{result.imported !== 1 ? "s" : ""} imported
                </p>
                {result.errors.length > 0 && (
                  <p className="text-sm text-green-700 dark:text-green-500">{result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped</p>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <ScrollArea className="h-32 border rounded-lg p-3">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive mb-1">{e}</p>
                ))}
              </ScrollArea>
            )}

            <div className="flex justify-end gap-2">
              {result.errors.length > 0 && (
                <Button variant="outline" size="sm" onClick={reset}>Import more</Button>
              )}
              <Button size="sm" onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
