"use client";

/**
 * Settings → Navigation. Rename, reorder and hide sidebar items.
 *
 * Reordering is within a section, deliberately: the sections are what explain
 * what an item is, and letting "Invoices" slide up into Workspace would make
 * the grouping meaningless. Renaming is unrestricted.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import { Eye, EyeOff, GripVertical, Loader2, RotateCcw } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { saveNavConfig } from "@/lib/actions/navigation";
import { labelFor, type NavConfig } from "@/lib/nav/config";

export interface NavRow {
  href: string;
  /** The built-in name — what it's called with no preset and no override. */
  fallback: string;
  section: string;
}

export function NavigationSettings({
  rows, config, presetVocab, presetName,
}: {
  rows: NavRow[];
  config: NavConfig | null;
  presetVocab: Record<string, string> | null;
  presetName: string | null;
}) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(config?.labels ?? {});
  const [hidden, setHidden] = useState<string[]>(config?.hidden ?? []);
  const [order, setOrder] = useState<string[]>(
    // Seed from the rows as displayed, so dragging one item doesn't reshuffle
    // everything else relative to it.
    config?.order?.length ? config.order : rows.map((r) => r.href),
  );
  const [busy, setBusy] = useState(false);

  const sections = Array.from(new Set(rows.map((r) => r.section)));
  const rank = new Map(order.map((h, i) => [h, i]));
  const inSection = (s: string) =>
    rows.filter((r) => r.section === s)
      .sort((a, b) => (rank.get(a.href) ?? 1e9) - (rank.get(b.href) ?? 1e9));

  /** What it's called right now — override, else preset, else built-in. */
  const current = (r: NavRow) => labelFor(r.href, r.fallback, { labels }, presetVocab);

  const save = async (next?: Partial<NavConfig>) => {
    setBusy(true);
    try {
      const res = await saveNavConfig({ labels, hidden, order, ...next });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Navigation updated");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const resetAll = async () => {
    setLabels({}); setHidden([]); setOrder(rows.map((r) => r.href));
    await save({ labels: {}, hidden: [], order: [] });
  };

  /** Reorder within one section, then splice it back into the global order. */
  const reorderSection = (section: string, hrefs: string[]) => {
    const others = order.filter((h) => !hrefs.includes(h));
    const anchor = order.findIndex((h) => hrefs.includes(h));
    const at = anchor === -1 ? others.length : anchor;
    setOrder([...others.slice(0, at), ...hrefs, ...others.slice(at)]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navigation"
        subtitle="Rename, reorder and hide the items in your sidebar."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetAll} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
            <Button size="sm" onClick={() => save()} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </div>
        }
      />

      {presetName && (
        <p className="text-sm text-muted-foreground">
          Names you don&rsquo;t set follow the <strong>{presetName}</strong> preset —
          so if the preset improves, yours does too. Anything you type here wins over it.
        </p>
      )}

      {sections.map((section) => {
        const items = inSection(section);
        return (
          <Card key={section}>
            <CardContent className="space-y-1 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section}
              </p>
              <Reorder.Group
                axis="y"
                values={items.map((i) => i.href)}
                onReorder={(hrefs) => reorderSection(section, hrefs as string[])}
                className="space-y-1"
              >
                {items.map((row) => {
                  const isHidden = hidden.includes(row.href);
                  return (
                    <Reorder.Item
                      key={row.href}
                      value={row.href}
                      className="flex items-center gap-2 rounded-md border border-transparent bg-card px-1 py-1 hover:border-border"
                    >
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                      <Input
                        value={current(row)}
                        disabled={busy}
                        aria-label={`Name for ${row.fallback}`}
                        onChange={(e) => setLabels({ ...labels, [row.href]: e.target.value })}
                        className={isHidden ? "opacity-50" : ""}
                      />
                      <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block">
                        {row.href}
                      </span>
                      <Button
                        type="button" variant="ghost" size="sm" disabled={busy}
                        aria-label={isHidden ? `Show ${row.fallback}` : `Hide ${row.fallback}`}
                        onClick={() => setHidden(
                          isHidden ? hidden.filter((h) => h !== row.href) : [...hidden, row.href],
                        )}
                      >
                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </CardContent>
          </Card>
        );
      })}

      {/* Hiding is not disabling. Say so, or someone will hide Invoices
          expecting it to stop invoicing. */}
      <p className="text-xs text-muted-foreground">
        Hiding an item only removes it from the sidebar — the pages still work and
        anyone with the link can reach them. To turn a feature off entirely, use
        the Plugins store. Workers always keep their own navigation.
      </p>
    </div>
  );
}
