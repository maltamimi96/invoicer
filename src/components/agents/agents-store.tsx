"use client";

import { useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bot, MailSearch, PlugZap, BellRing, Send,
  Settings, Trash2, Plus, Lock, Building2,
  Zap, Newspaper, MailCheck, UserRoundCheck, FileClock, CheckCircle, Star, ClipboardList, ListChecks,
  LayoutDashboard, Users, Columns3, Users2, UserPlus, FileCheck, FileText, Repeat, FileStack,
  Wrench, CalendarDays, Package, MessageSquare, TrendingUp, Sparkles, Receipt, Boxes, Clock, Hammer, Target, DollarSign,
  Megaphone, Search, X,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  AGENT_CATALOG,
  CATEGORY_LABELS,
  BADGE_LABELS,
  type AgentDefinition,
  type AgentCategory,
} from "@/lib/agents-catalog";
import {
  installAgent,
  uninstallAgent,
  toggleAgent,
  type AgentInstall,
} from "@/lib/actions/agents";
import { setPluginEnabled, applyPresetToActiveBusiness } from "@/lib/actions/plugins";
import { PLUGIN_REGISTRY, PLUGIN_CATEGORIES, PLUGINS_BY_ID, OPTIONAL_PLUGINS, type PluginDefinition } from "@/lib/plugins/registry";
import { INDUSTRY_PRESETS, type IndustryPreset } from "@/lib/plugins/presets";

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  bot: Bot,
  "mail-search": MailSearch,
  "plug-zap": PlugZap,
  "bell-ring": BellRing,
  send: Send,
  newspaper: Newspaper,
  "mail-check": MailCheck,
  "user-round-check": UserRoundCheck,
  "file-clock": FileClock,
  "check-circle": CheckCircle,
  star: Star,
  "clipboard-list": ClipboardList,
  "list-checks": ListChecks,
  "layout-dashboard": LayoutDashboard,
  lock: Lock,
  "building-2": Building2,
  users: Users,
  columns: Columns3,
  "users-2": Users2,
  settings: Settings,
  "user-plus": UserPlus,
  "file-check": FileCheck,
  "file-text": FileText,
  repeat: Repeat,
  "file-stack": FileStack,
  wrench: Wrench,
  "calendar-days": CalendarDays,
  package: Package,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  megaphone: Megaphone,
  sparkles: Sparkles,
  receipt: Receipt,
  "dollar-sign": DollarSign,
  boxes: Boxes,
  clock: Clock,
  hammer: Hammer,
  target: Target,
};

// Module plugins shown in the Modules section. The two verticals that already
// have agent-store cards keep those cards (same table, same sync) — exclude
// them here so they don't appear twice.
const AGENT_CARD_IDS = new Set(AGENT_CATALOG.map((a) => a.id));
const MODULES: PluginDefinition[] = PLUGIN_REGISTRY.filter(
  (p) => p.kind === "module" && !AGENT_CARD_IDS.has(p.id)
);

// Grouped by what the modules are FOR. Empty groups are dropped so removing
// the last module in a category doesn't leave a heading over nothing.
const MODULE_GROUPS = PLUGIN_CATEGORIES
  .map((c) => ({ ...c, modules: MODULES.filter((m) => m.category === c.id) }))
  .filter((g) => g.modules.length > 0);

function AgentIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Zap;
  return <Icon className={className} />;
}

// ── Category filter ────────────────────────────────────────────────────────────

const ALL_CATEGORIES: (AgentCategory | "all")[] = [
  "all",
  "productivity",
  "leads",
  "integrations",
  "billing",
  "communication",
];

// ── Main component ─────────────────────────────────────────────────────────────

interface AgentsStoreProps {
  installs: AgentInstall[];
  /** Resolved plugin-enabled map (plugin id → enabled) from the server. */
  pluginEnabled: Record<string, boolean>;
  /** businesses.industry_preset — the preset currently applied, if any. */
  activePreset: string | null;
}

export function AgentsStore({ installs: initialInstalls, pluginEnabled, activePreset }: AgentsStoreProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [installs, setInstalls] = useState<AgentInstall[]>(initialInstalls);
  const [activeCategory, setActiveCategory] = useState<AgentCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [uninstallTarget, setUninstallTarget] = useState<AgentDefinition | null>(null);
  const [modules, setModules] = useState<Record<string, boolean>>(pluginEnabled);
  const [presetTarget, setPresetTarget] = useState<IndustryPreset | null>(null);

  function handleApplyPreset(preset: IndustryPreset) {
    startTransition(async () => {
      try {
        await applyPresetToActiveBusiness(preset.id);
        // Reflect the new enabled set locally so the Modules toggles update at once.
        const next: Record<string, boolean> = { ...modules };
        for (const p of OPTIONAL_PLUGINS) next[p.id] = preset.plugins.includes(p.id);
        setModules(next);
        toast.success(`${preset.label} preset applied`);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't apply preset");
      } finally {
        setPresetTarget(null);
      }
    });
  }

  function handleModuleToggle(plugin: PluginDefinition, enabled: boolean) {
    setModules((prev) => ({ ...prev, [plugin.id]: enabled }));
    startTransition(async () => {
      try {
        await setPluginEnabled(plugin.id, enabled);
        toast.success(enabled ? `${plugin.name} enabled` : `${plugin.name} hidden — data kept, re-enable anytime`);
        refresh();
      } catch (e) {
        setModules((prev) => ({ ...prev, [plugin.id]: !enabled }));
        toast.error(e instanceof Error ? e.message : "Couldn't update module");
      }
    });
  }

  const installMap = new Map(installs.map((i) => [i.agent_id, i]));

  // One search across BOTH catalogues. Someone hunting for "invoice" does not
  // know or care whether the thing they want is filed as a module or an agent —
  // asking them to guess which of two lists to look in is the search box's job
  // to make unnecessary.
  const query = search.trim().toLowerCase();
  const matches = (name: string, description: string) =>
    !query || `${name} ${description}`.toLowerCase().includes(query);

  const filtered = AGENT_CATALOG
    .filter((a) => activeCategory === "all" || a.category === activeCategory)
    .filter((a) => matches(a.name, a.description));

  // Groups whose modules all filtered out are dropped, so a search never leaves
  // a heading standing over nothing.
  const visibleGroups = MODULE_GROUPS
    .map((g) => ({ ...g, modules: g.modules.filter((m) => matches(m.name, m.description)) }))
    .filter((g) => g.modules.length > 0);

  const hitCount = filtered.length + visibleGroups.reduce((n, g) => n + g.modules.length, 0);

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleInstall(agent: AgentDefinition) {
    startTransition(async () => {
      try {
        await installAgent(agent.id);
        setInstalls((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            business_id: "",
            agent_id: agent.id,
            enabled: true,
            config: {},
            installed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
        toast.success(`${agent.name} added`);
        refresh();
      } catch {
        toast.error("Failed to add agent");
      }
    });
  }

  function handleUninstall(agent: AgentDefinition) {
    startTransition(async () => {
      try {
        await uninstallAgent(agent.id);
        setInstalls((prev) => prev.filter((i) => i.agent_id !== agent.id));
        toast.success(`${agent.name} removed`);
        refresh();
      } catch {
        toast.error("Failed to remove agent");
      } finally {
        setUninstallTarget(null);
      }
    });
  }

  function handleToggle(agent: AgentDefinition, enabled: boolean) {
    setInstalls((prev) =>
      prev.map((i) => (i.agent_id === agent.id ? { ...i, enabled } : i))
    );
    startTransition(async () => {
      try {
        await toggleAgent(agent.id, enabled);
        toast.success(enabled ? `${agent.name} enabled` : `${agent.name} paused`);
        refresh();
      } catch {
        // revert
        setInstalls((prev) =>
          prev.map((i) => (i.agent_id === agent.id ? { ...i, enabled: !enabled } : i))
        );
        toast.error("Failed to update agent");
      }
    });
  }

  function handleConfigure(agent: AgentDefinition) {
    if (agent.configPath) router.push(agent.configPath);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const installedCount = installs.length;
  const activeCount = installs.filter((i) => i.enabled).length;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-stretch gap-3 min-w-0">
            <div
              className="w-1 rounded-full shrink-0"
              style={{ backgroundImage: "linear-gradient(180deg, #fb923c 0%, #c2410c 100%)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight">Plugins</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Shape Kirei to your business — turn modules on or off, and add AI agents
              </p>
            </div>
          </div>
          {installedCount > 0 && (
            <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground px-3 py-1.5 rounded-xl bg-muted/60 border border-border">
              <span className="font-semibold text-foreground tabular-nums">{activeCount}</span> of{" "}
              <span className="font-semibold text-foreground tabular-nums">{installedCount}</span> active
            </div>
          )}
        </div>

        {/* Search — spans modules and agents alike */}
        <div className="mt-5 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules and agents…"
            className="pl-9 pr-9"
            aria-label="Search modules and agents"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {query && (
          <p className="mt-2 text-xs text-muted-foreground">
            {hitCount === 0
              ? `Nothing matches "${search.trim()}"`
              : `${hitCount} ${hitCount === 1 ? "match" : "matches"} for "${search.trim()}"`}
          </p>
        )}

        {/* Category filter — agents only, so it is hidden while searching */}
        <div className={cn("mt-5 flex flex-wrap gap-2", query && "hidden")}>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Industry presets — one click to shape the whole app for a business type.
          Hidden mid-search: they are not things you search FOR. */}
      <div className={cn("mb-10", query && "hidden")}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Industry preset</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INDUSTRY_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <div
                key={preset.id}
                className={cn(
                  "rounded-xl border bg-card p-4 flex items-start gap-3",
                  isActive ? "border-primary/40 shadow-sm" : "border-border"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold break-words">{preset.label}</p>
                    {isActive && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preset.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={isActive ? "ghost" : "outline"}
                  className="h-7 px-3 text-xs shrink-0"
                  onClick={() => setPresetTarget(preset)}
                  disabled={isPending}
                >
                  {isActive ? "Re-apply" : "Apply"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          A preset turns a bundle of modules on and hides the rest. Nothing is deleted — you can fine-tune individual modules below.
        </p>
      </div>

      {/* Modules — grouped by the job they do, not by where they live in the
          code. A flat wall of thirty toggles told nobody what to turn on. */}
      <div className={cn("mb-10", visibleGroups.length === 0 && "hidden")}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Modules</h2>
        {visibleGroups.map((group) => (
        <div key={group.id} className="mb-6">
        <div className="mb-2.5">
          <p className="text-sm font-semibold">{group.label}</p>
          <p className="text-xs text-muted-foreground">{group.blurb}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {group.modules.map((m) => {
            const enabled = m.core ? true : (modules[m.id] ?? m.defaultEnabled);
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <AgentIcon name={m.icon ?? "zap"} className="w-4.5 h-4.5 text-foreground/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold break-words">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.description}</p>
                </div>
                {m.core ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-1 shrink-0">
                    <Lock className="w-3 h-3" /> Core
                  </span>
                ) : (
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => handleModuleToggle(m, v)}
                    disabled={isPending}
                    aria-label={enabled ? `Disable ${m.name}` : `Enable ${m.name}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        </div>
        ))}
        <p className="text-[11px] text-muted-foreground mt-2">Turning a module off only hides it — nothing is deleted, and re-enabling brings everything back.</p>
      </div>

      <h2 className={cn(
        "text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3",
        filtered.length === 0 && "hidden",
      )}>AI Agents</h2>
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((agent, i) => {
          const install = installMap.get(agent.id);
          const isInstalled = !!install;

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
            >
              <AgentCard
                agent={agent}
                install={install}
                isInstalled={isInstalled}
                isPending={isPending}
                onInstall={() => handleInstall(agent)}
                onUninstall={() => setUninstallTarget(agent)}
                onToggle={(enabled) => handleToggle(agent, enabled)}
                onConfigure={() => handleConfigure(agent)}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Apply-preset confirm dialog */}
      <AlertDialog
        open={!!presetTarget}
        onOpenChange={(open) => !open && setPresetTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply the {presetTarget?.label} preset?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>This sets which modules are on for this business. Hidden modules keep all their data — re-enable any of them anytime.</p>
                {presetTarget && (() => {
                  const on = OPTIONAL_PLUGINS.filter((p) => presetTarget.plugins.includes(p.id));
                  const off = OPTIONAL_PLUGINS.filter((p) => !presetTarget.plugins.includes(p.id));
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Turned on</p>
                        <p className="text-xs text-muted-foreground">{on.map((p) => PLUGINS_BY_ID[p.id].name).join(", ") || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Hidden</p>
                        <p className="text-xs text-muted-foreground">{off.map((p) => PLUGINS_BY_ID[p.id].name).join(", ") || "—"}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => presetTarget && handleApplyPreset(presetTarget)}
            >
              Apply preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Uninstall confirm dialog */}
      <AlertDialog
        open={!!uninstallTarget}
        onOpenChange={(open) => !open && setUninstallTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {uninstallTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the agent for your business. You can add it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => uninstallTarget && handleUninstall(uninstallTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Agent card ─────────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentDefinition;
  install: AgentInstall | undefined;
  isInstalled: boolean;
  isPending: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
}

function AgentCard({
  agent,
  install,
  isInstalled,
  isPending,
  onInstall,
  onUninstall,
  onToggle,
  onConfigure,
}: AgentCardProps) {
  const isEnabled = install?.enabled ?? false;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-5 gap-4 transition-shadow",
        isInstalled && "border-primary/30 shadow-sm"
      )}
    >
      {/* Status dot for installed agents */}
      {isInstalled && (
        <span
          className={cn(
            "absolute top-3 right-3 w-2 h-2 rounded-full",
            isEnabled ? "bg-emerald-400" : "bg-amber-400"
          )}
        />
      )}

      {/* Icon + badges */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            isInstalled
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <AgentIcon name={agent.icon} className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{agent.name}</span>
            {agent.badge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {BADGE_LABELS[agent.badge]}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {CATEGORY_LABELS[agent.category]}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed flex-1">
        {agent.description}
      </p>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        {isInstalled ? (
          <>
            {/* Enable / disable toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={isEnabled}
                onCheckedChange={onToggle}
                disabled={isPending}
                aria-label={isEnabled ? "Disable agent" : "Enable agent"}
              />
              <span className="text-xs text-muted-foreground">
                {isEnabled ? "Active" : "Paused"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {agent.configType !== "none" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={onConfigure}
                >
                  <Settings className="w-3.5 h-3.5 mr-1" />
                  Configure
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onUninstall}
                disabled={isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">Not installed</span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={onInstall}
              disabled={isPending}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Agent
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
