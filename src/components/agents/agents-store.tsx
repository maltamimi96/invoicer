"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bot, MailSearch, PlugZap, BellRing, Send,
  Settings, Trash2, Plus, Lock,
  Zap, Newspaper, MailCheck, UserRoundCheck, FileClock, CheckCircle, Star, ClipboardList, ListChecks,
  LayoutDashboard, Users, Columns3, Users2, UserPlus, FileCheck, FileText, Repeat, FileStack,
  Wrench, CalendarDays, Package, MessageSquare, TrendingUp, Sparkles, Receipt, Boxes, Clock, Hammer, Target, DollarSign,
  Megaphone,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
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
import { PLUGIN_REGISTRY, PLUGINS_BY_ID, OPTIONAL_PLUGINS, type PluginDefinition } from "@/lib/plugins/registry";
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
  const [installs, setInstalls] = useState<AgentInstall[]>(initialInstalls);
  const [activeCategory, setActiveCategory] = useState<AgentCategory | "all">("all");
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
        router.refresh();
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
        router.refresh();
      } catch (e) {
        setModules((prev) => ({ ...prev, [plugin.id]: !enabled }));
        toast.error(e instanceof Error ? e.message : "Couldn't update module");
      }
    });
  }

  const installMap = new Map(installs.map((i) => [i.agent_id, i]));

  const filtered =
    activeCategory === "all"
      ? AGENT_CATALOG
      : AGENT_CATALOG.filter((a) => a.category === activeCategory);

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
        router.refresh();
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
        router.refresh();
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
        router.refresh();
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

        {/* Category filter */}
        <div className="mt-5 flex flex-wrap gap-2">
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

      {/* Industry presets — one click to shape the whole app for a business type */}
      <div className="mb-10">
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

      {/* Modules — the app's building blocks */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map((m) => {
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
        <p className="text-[11px] text-muted-foreground mt-2">Turning a module off only hides it — nothing is deleted, and re-enabling brings everything back.</p>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">AI Agents</h2>
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((agent, i) => {
          const install = installMap.get(agent.id);
          const isInstalled = !!install;
          const isComingSoon = agent.badge === "coming-soon";

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
                isComingSoon={isComingSoon}
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
  isComingSoon: boolean;
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
  isComingSoon,
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
        isComingSoon && "opacity-60",
        isInstalled && !isComingSoon && "border-primary/30 shadow-sm"
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
            {agent.badge && agent.badge !== "coming-soon" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {BADGE_LABELS[agent.badge]}
              </Badge>
            )}
            {isComingSoon && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Coming Soon
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
        {isComingSoon ? (
          <span className="text-xs text-muted-foreground">Available soon</span>
        ) : isInstalled ? (
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
