"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Plus, Edit, MapPin, Wrench, Boxes, Users, CreditCard,
  Calendar, KeyRound, Car, FileText, Trash2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AddressLink, MapPinLink } from "@/components/ui/address-link";
import { formatDate, getStatusColor } from "@/lib/utils";
import {
  createSiteAsset, updateSiteAsset, archiveSiteAsset,
} from "@/lib/actions/site-assets";
import { setSiteBilling } from "@/lib/actions/billing-profiles";
import { updateSite } from "@/lib/actions/sites";
import type {
  Site, Account, SiteAsset, BillingProfile, Contact,
} from "@/types/database";

interface JobRow {
  id: string;
  number: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Props {
  site: Site;
  account: Account;
  siteContacts: Array<{ role: string; is_primary: boolean; contacts: Contact }>;
  assets: SiteAsset[];
  jobs: JobRow[];
  billingProfiles: BillingProfile[];
  currentBillingProfileId: string | null;
}

export function SiteDetailClient({
  site: initialSite, account, siteContacts, assets: initialAssets, jobs,
  billingProfiles, currentBillingProfileId: initialBilling,
}: Props) {
  const [site, setSite] = useState(initialSite);
  const [assets, setAssets] = useState(initialAssets);
  const [billingId, setBillingId] = useState(initialBilling);
  const [editing, setEditing] = useState(false);
  const [assetModal, setAssetModal] = useState<{ open: boolean; asset?: SiteAsset }>({ open: false });
  const [, startTransition] = useTransition();

  const fullAddress = [site.address, site.city, site.postcode, site.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Link href={`/customers/${account.id}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            <Link href={`/customers/${account.id}`} className="hover:underline">{account.name}</Link>
          </p>
          <h1 className="text-2xl font-bold truncate">{site.label || "Site"}</h1>
          <p className="text-sm text-muted-foreground truncate">{fullAddress || "No address"}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
            <Edit className="w-3.5 h-3.5 mr-1.5" />{editing ? "Cancel" : "Edit"}
          </Button>
          <Link href={`/work-orders/new?site=${site.id}`}>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />New job</Button>
          </Link>
        </div>
      </motion.div>

      {editing ? (
        <SiteEditCard
          site={site}
          onSave={(s) => { setSite(s); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left rail */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total jobs", value: jobs.length },
                { label: "Open", value: jobs.filter((j) => !["completed", "cancelled"].includes(j.status)).length },
                { label: "Assets", value: assets.length },
                { label: "Contacts", value: siteContacts.length },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-semibold">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Address & access */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />Site
                </h3>
                {fullAddress ? (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPinLink address={fullAddress} />
                    <AddressLink address={fullAddress} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No address set</p>
                )}
                {site.gate_code && (
                  <div className="flex items-center gap-2 text-sm">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{site.gate_code}</span>
                  </div>
                )}
                {site.parking_notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{site.parking_notes}</span>
                  </div>
                )}
                {site.access_notes && (
                  <>
                    <Separator />
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{site.access_notes}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Bill-to */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />Bill to
                </h3>
                <Select
                  value={billingId ?? ""}
                  onValueChange={(v) => {
                    startTransition(async () => {
                      try {
                        await setSiteBilling(site.id, v);
                        setBillingId(v);
                        toast.success("Billing updated");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    });
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select billing profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {billingProfiles.map((bp) => (
                      <SelectItem key={bp.id} value={bp.id} className="text-xs">
                        {bp.name}{bp.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {billingId && (
                  <div className="text-xs text-muted-foreground">
                    {billingProfiles.find((b) => b.id === billingId)?.email ?? ""}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="assets">
              <TabsList className="w-full flex-wrap h-auto gap-1 mb-1">
                <TabsTrigger value="assets" className="gap-1.5">
                  <Boxes className="w-3.5 h-3.5" />Assets ({assets.length})
                </TabsTrigger>
                <TabsTrigger value="jobs" className="gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />Jobs ({jobs.length})
                </TabsTrigger>
                <TabsTrigger value="contacts" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" />Site contacts ({siteContacts.length})
                </TabsTrigger>
              </TabsList>

              {/* Assets */}
              <TabsContent value="assets" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => setAssetModal({ open: true })}>
                    <Plus className="w-3.5 h-3.5" />Add asset
                  </Button>
                </div>
                {assets.length === 0 ? (
                  <EmptyState icon={<Boxes className="w-8 h-8" />}
                    text="No assets yet"
                    sub="Track equipment installed at this site (boilers, AC units, roofs)" />
                ) : assets.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{a.name}</p>
                            {a.type && <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {a.make && <span>Make: {a.make}</span>}
                            {a.model && <span>Model: {a.model}</span>}
                            {a.serial_number && <span className="font-mono">SN: {a.serial_number}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {a.install_date && <span>Installed: {formatDate(a.install_date)}</span>}
                            {a.last_serviced && <span>Last serviced: {formatDate(a.last_serviced)}</span>}
                            {a.warranty_expiry && <span>Warranty: {formatDate(a.warranty_expiry)}</span>}
                          </div>
                          {a.notes && <p className="text-xs text-muted-foreground italic">{a.notes}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => setAssetModal({ open: true, asset: a })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => {
                              startTransition(async () => {
                                try {
                                  await archiveSiteAsset(a.id);
                                  setAssets((prev) => prev.filter((x) => x.id !== a.id));
                                  toast.success("Removed");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed");
                                }
                              });
                            }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Jobs */}
              <TabsContent value="jobs" className="mt-3 space-y-2">
                {jobs.length === 0 ? (
                  <EmptyState icon={<Wrench className="w-8 h-8" />}
                    text="No jobs at this site yet" />
                ) : jobs.map((j) => (
                  <Link key={j.id} href={`/work-orders/${j.id}`}>
                    <Card className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{j.number}</span>
                            <span className="font-medium text-sm truncate">{j.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {j.scheduled_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{formatDate(j.scheduled_date)}
                              </span>
                            )}
                            <span>Created {formatDate(j.created_at)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${getStatusColor(j.status)}`}>{j.status}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </TabsContent>

              {/* Site contacts */}
              <TabsContent value="contacts" className="mt-3 space-y-2">
                {siteContacts.length === 0 ? (
                  <EmptyState icon={<Users className="w-8 h-8" />}
                    text="No site contacts"
                    sub="Add tenants, supers, or building managers tied to this site" />
                ) : siteContacts.map((sc) => (
                  <Card key={sc.contacts.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sc.contacts.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{sc.role}</Badge>
                          {sc.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sc.contacts.email}{sc.contacts.email && sc.contacts.phone ? " · " : ""}{sc.contacts.phone}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Manage contacts on the <Link href={`/customers/${account.id}`} className="underline">account page</Link>.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {assetModal.open && (
        <AssetModal
          siteId={site.id}
          asset={assetModal.asset}
          onSave={(saved) => {
            setAssets((prev) => {
              const i = prev.findIndex((a) => a.id === saved.id);
              if (i === -1) return [...prev, saved];
              const copy = [...prev]; copy[i] = saved; return copy;
            });
            setAssetModal({ open: false });
          }}
          onClose={() => setAssetModal({ open: false })}
        />
      )}
    </div>
  );
}

// ── Site edit card ──────────────────────────────────────────────────────────

function SiteEditCard({ site, onSave, onCancel }: { site: Site; onSave: (s: Site) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    label: site.label ?? "",
    address: site.address ?? "",
    city: site.city ?? "",
    postcode: site.postcode ?? "",
    country: site.country ?? "",
    gate_code: site.gate_code ?? "",
    parking_notes: site.parking_notes ?? "",
    access_notes: site.access_notes ?? "",
  });
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Label"><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Main building" /></Field>
        <Field label="Gate code"><Input value={form.gate_code} onChange={(e) => setForm((f) => ({ ...f, gate_code: e.target.value }))} /></Field>
        <Field label="Address" wide><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
        <Field label="City"><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></Field>
        <Field label="Postcode"><Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} /></Field>
        <Field label="Country" wide><Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} /></Field>
        <Field label="Parking notes" wide><Input value={form.parking_notes} onChange={(e) => setForm((f) => ({ ...f, parking_notes: e.target.value }))} /></Field>
        <Field label="Access notes" wide><Textarea rows={3} value={form.access_notes} onChange={(e) => setForm((f) => ({ ...f, access_notes: e.target.value }))} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => {
            try {
              const saved = await updateSite(site.id, form);
              onSave(saved);
              toast.success("Site updated");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
      </div>
    </CardContent></Card>
  );
}

// ── Asset modal ─────────────────────────────────────────────────────────────

function AssetModal({ siteId, asset, onSave, onClose }: {
  siteId: string; asset?: SiteAsset; onSave: (a: SiteAsset) => void; onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: asset?.name ?? "",
    type: asset?.type ?? "",
    make: asset?.make ?? "",
    model: asset?.model ?? "",
    serial_number: asset?.serial_number ?? "",
    install_date: asset?.install_date ?? "",
    warranty_expiry: asset?.warranty_expiry ?? "",
    last_serviced: asset?.last_serviced ?? "",
    notes: asset?.notes ?? "",
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name *" wide><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main boiler" /></Field>
          <Field label="Type"><Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="boiler / AC / roof" /></Field>
          <Field label="Make"><Input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} /></Field>
          <Field label="Model"><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></Field>
          <Field label="Serial number"><Input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} /></Field>
          <Field label="Install date"><Input type="date" value={form.install_date} onChange={(e) => setForm((f) => ({ ...f, install_date: e.target.value }))} /></Field>
          <Field label="Last serviced"><Input type="date" value={form.last_serviced} onChange={(e) => setForm((f) => ({ ...f, last_serviced: e.target.value }))} /></Field>
          <Field label="Warranty expiry"><Input type="date" value={form.warranty_expiry} onChange={(e) => setForm((f) => ({ ...f, warranty_expiry: e.target.value }))} /></Field>
          <Field label="Notes" wide><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending}
            onClick={() => {
              if (!form.name.trim()) { toast.error("Name required"); return; }
              start(async () => {
                try {
                  const payload = {
                    name: form.name,
                    type: form.type || null,
                    make: form.make || null,
                    model: form.model || null,
                    serial_number: form.serial_number || null,
                    install_date: form.install_date || null,
                    warranty_expiry: form.warranty_expiry || null,
                    last_serviced: form.last_serviced || null,
                    notes: form.notes || null,
                  };
                  const saved = asset
                    ? await updateSiteAsset(asset.id, payload)
                    : await createSiteAsset(siteId, payload);
                  onSave(saved);
                  toast.success(asset ? "Updated" : "Added");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              });
            }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <div className="flex justify-center mb-3 opacity-50">{icon}</div>
      <p className="text-sm">{text}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}
