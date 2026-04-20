"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Key, Plus, Copy, Trash2, Shield, Check, Eye, EyeOff } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { createApiKey, revokeApiKey } from "@/lib/actions/api-keys";
import type { BusinessApiKey, ApiScope } from "@/types/database";
import { ALL_API_SCOPES } from "@/types/database";

interface ApiKeysSettingsProps {
  apiKeys: Omit<BusinessApiKey, "key_hash">[];
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ApiKeysSettings({ apiKeys: initialKeys }: ApiKeysSettingsProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([]);

  const handleCreate = () => {
    if (!label.trim()) { toast.error("Label is required"); return; }
    if (!selectedScopes.length) { toast.error("Select at least one scope"); return; }

    startTransition(async () => {
      try {
        const { key, apiKey } = await createApiKey(label.trim(), selectedScopes);
        setKeys((prev) => [apiKey, ...prev]);
        setNewKeyValue(key);
        setShowCreate(false);
        setLabel("");
        setSelectedScopes([]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create key");
      }
    });
  };

  const handleRevoke = (id: string) => {
    startTransition(async () => {
      try {
        await revokeApiKey(id);
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setRevokeId(null);
        toast.success("API key revoked");
      } catch {
        toast.error("Failed to revoke key");
      }
    });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScope = (scope: ApiScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  // Group scopes by group
  const scopeGroups = ALL_API_SCOPES.reduce<Record<string, typeof ALL_API_SCOPES>>((acc, scope) => {
    (acc[scope.group] ??= []).push(scope);
    return acc;
  }, {});

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Keys
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Create keys to connect external apps (websites, Telegram bots, etc.) to this business.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create key
          </Button>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs mt-1">Create a key to start integrating external apps.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.label}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">inv_{k.key_prefix}...</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {k.last_used_at ? timeAgo(k.last_used_at) : "Never"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(k.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setRevokeId(k.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}

          <Separator className="my-4" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Usage</p>
            <p>Include your API key in requests:</p>
            <code className="block bg-muted px-3 py-2 rounded text-[11px] mt-1">
              Authorization: Bearer inv_your_key_here
            </code>
          </div>
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give this key a name and choose what it can access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                placeholder="e.g. Crown Roofers Website"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              {Object.entries(scopeGroups).map(([group, scopes]) => (
                <div key={group} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{group}</p>
                  {scopes.map((scope) => (
                    <label
                      key={scope.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
                    >
                      <Checkbox
                        checked={selectedScopes.includes(scope.value)}
                        onCheckedChange={() => toggleScope(scope.value)}
                      />
                      <span className="text-sm">{scope.label}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{scope.value}</Badge>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? "Creating..." : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Key reveal dialog ── */}
      <Dialog open={!!newKeyValue} onOpenChange={() => setNewKeyValue(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy this key now — you won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={newKeyValue ?? ""}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(newKeyValue!)}
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                Store this key securely. It will not be shown again. If lost, revoke it and create a new one.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setNewKeyValue(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke confirmation ── */}
      <AlertDialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any integration using this key will stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeId && handleRevoke(revokeId)}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
