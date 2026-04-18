"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bot, MailSearch, PlugZap, BellRing, Send,
  Settings, Trash2, Power, PowerOff, Plus, Check,
  Zap,
} from "lucide-react";
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

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  bot: Bot,
  "mail-search": MailSearch,
  "plug-zap": PlugZap,
  "bell-ring": BellRing,
  send: Send,
};

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
}

export function AgentsStore({ installs: initialInstalls }: AgentsStoreProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [installs, setInstalls] = useState<AgentInstall[]>(initialInstalls);
  const [activeCategory, setActiveCategory] = useState<AgentCategory | "all">("all");
  const [uninstallTarget, setUninstallTarget] = useState<AgentDefinition | null>(null);

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Add AI agents to automate tasks for your business.
            </p>
          </div>
          {installedCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activeCount}</span> of{" "}
              <span className="font-medium text-foreground">{installedCount}</span> active
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
