"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Webhook, Plus, Trash2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createWebhook, deleteWebhook, updateWebhookEnabled } from "@/lib/actions/webhooks";
import type { BusinessWebhook, WebhookEvent } from "@/types/database";
import { ALL_WEBHOOK_EVENTS } from "@/types/database";

interface WebhooksSettingsProps {
  webhooks: BusinessWebhook[];
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

export function WebhooksSettings({ webhooks: initialWebhooks }: WebhooksSettingsProps) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([]);

  const toggleEvent = (event: WebhookEvent) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = () => {
    if (!label.trim()) { toast.error("Label is required"); return; }
    if (!url.trim()) { toast.error("URL is required"); return; }
    if (!selectedEvents.length) { toast.error("Select at least one event"); return; }

    startTransition(async () => {
      try {
        const wh = await createWebhook({ url: url.trim(), label: label.trim(), events: selectedEvents, secret: secret || undefined });
        setWebhooks((prev) => [wh, ...prev]);
        setShowCreate(false);
        setLabel(""); setUrl(""); setSecret(""); setSelectedEvents([]);
        toast.success("Webhook created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create");
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteWebhook(id);
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        setDeleteId(null);
        toast.success("Webhook deleted");
      } catch { toast.error("Failed to delete"); }
    });
  };

  const handleToggle = (id: string, enabled: boolean) => {
    setWebhooks((prev) => prev.map((w) => w.id === id ? { ...w, enabled } : w));
    startTransition(async () => {
      try {
        await updateWebhookEnabled(id, enabled);
      } catch {
        setWebhooks((prev) => prev.map((w) => w.id === id ? { ...w, enabled: !enabled } : w));
        toast.error("Failed to update");
      }
    });
  };

  const eventGroups = ALL_WEBHOOK_EVENTS.reduce<Record<string, typeof ALL_WEBHOOK_EVENTS>>((acc, e) => {
    (acc[e.group] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Webhooks
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Send real-time notifications to external apps (Zapier, Make, custom) when events happen.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add webhook
          </Button>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No webhooks configured</p>
              <p className="text-xs mt-1">Add a webhook to start sending events to external apps.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-16">Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.label}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px] block">
                        {w.url}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {w.events.length <= 3 ? (
                          w.events.map((e) => (
                            <Badge key={e} variant="secondary" className="text-[10px] px-1.5 py-0">{e}</Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {w.events.length} events
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(w.created_at)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={w.enabled}
                        onCheckedChange={(checked) => handleToggle(w.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(w.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Separator className="my-4" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Zapier Setup</p>
            <p>In Zapier, create a new Zap with trigger "Webhooks by Zapier" &rarr; "Catch Hook". Copy the webhook URL and paste it here.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription>
              Configure a URL to receive event notifications via POST requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                placeholder="e.g. Zapier — New Leads"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                placeholder="https://hooks.zapier.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Signing Secret <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="Used to verify webhook authenticity"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If set, each request includes an X-Webhook-Signature header (HMAC-SHA256).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              {Object.entries(eventGroups).map(([group, events]) => (
                <div key={group} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{group}</p>
                  {events.map((event) => (
                    <label
                      key={event.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
                    >
                      <Checkbox
                        checked={selectedEvents.includes(event.value)}
                        onCheckedChange={() => toggleEvent(event.value)}
                      />
                      <span className="text-sm">{event.label}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{event.value}</Badge>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? "Creating..." : "Add webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              This webhook will stop receiving events immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
