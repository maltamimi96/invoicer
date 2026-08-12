"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus, Edit, MapPin, Wrench, Boxes, Users, CreditCard,
  Calendar, KeyRound, Car, FileText, Trash2, Check, X,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { AddressLink, MapPinLink } from "@/components/ui/address-link";
import { formatDate, getStatusColor } from "@/lib/utils";
import {
  createSiteAsset, updateSiteAsset, archiveSiteAsset,
} from "@/lib/actions/site-assets";
import { setSiteBilling } from "@/lib/actions/billing-profiles";
import { updateSite } from "@/lib/actions/sites";
import { DetailHero, AnimatedPress, StatTile, FadeIn, GradientTile } from "@/components/ui/kirei";
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
      <DetailHero
        backHref={`/customers/${account.id}`}
        eyebrow={<Link href={`/customers/${account.id}`} className="hover:underline">{account.name}</Link>}
        title={site.label || "Site"}
        subtitle={fullAddress || "No address"}
        gradient="emerald"
        icon={<MapPin className="w-6 h-6" />}
        actions={
          <>
            <AnimatedPress
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
            >
              <Edit className="w-4 h-4" /> {editing ? "Cancel" : "Edit"}
            </AnimatedPress>
            <Link href={`/work-orders/new?site=${site.id}`}>
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer">
                <Plus className="w-4 h-4" /> New job
              </AnimatedPress>
            </Link>
          </>
        }
      />

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
            {/* Stat tiles */}
            <FadeIn delay={60}>
              <div className="grid grid-cols-2 gap-2">
                <StatTile gradient="softTeal"   tone="info" icon={<Wrench   className="w-3 h-3" />} label="Total jobs" value={String(jobs.length)} />
                <StatTile gradient="softAmber"  tone="warn" icon={<Wrench   className="w-3 h-3" />} label="Open"       value={String(jobs.filter((j) => !["completed", "cancelled"].includes(j.status)).length)} />
                <StatTile gradient="softBlue"   tone="info" icon={<Boxes    className="w-3 h-3" />} label="Assets"     value={String(assets.length)} />
                <StatTile gradient="softViolet" tone="accent" icon={<Users    className="w-3 h-3" />} label="Contacts"   value={String(siteContacts.length)} />
              </div>
            </FadeIn>

            {/* Address & access */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                <GradientTile gradient="emerald" size={28} radius={8}>
                  <MapPin className="w-3.5 h-3.5" />
                </GradientTile>
                <h3 className="text-sm font-semibold">Site</h3>
              </div>
              <div className="p-4 space-y-3">
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
              </div>
            </div>

            {/* Bill-to */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                <GradientTile gradient="violet" size={28} radius={8}>
                  <CreditCard className="w-3.5 h-3.5" />
                </GradientTile>
                <h3 className="text-sm font-semibold">Bill to</h3>
              </div>
              <div className="p-4 space-y-3">
                <SearchableSelect
                  items={billingProfiles.map((bp) => ({
                    value: bp.id,
                    label: bp.name + (bp.is_default ? " (default)" : ""),
                    sublabel: bp.email || undefined,
                    keywords: [bp.name, bp.email].filter(Boolean).join(" "),
                  }))}
                  value={billingId ?? ""}
                  onValueChange={(v) => {
                    if (!v) return;
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
                  placeholder="Select billing profile"
                  searchPlaceholder="Search billing profiles..."
                />
                {billingId && (
                  <div className="text-xs text-muted-foreground">
                    {billingProfiles.find((b) => b.id === billingId)?.email ?? ""}
                  </div>
                )}
              </div>
            </div>
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
          <Field label="Install date"><DatePicker value={form.install_date} onChange={(v) => setForm((f) => ({ ...f, install_date: v }))} clearable /></Field>
          <Field label="Last serviced"><DatePicker value={form.last_serviced} onChange={(v) => setForm((f) => ({ ...f, last_serviced: v }))} clearable /></Field>
          <Field label="Warranty expiry"><DatePicker value={form.warranty_expiry} onChange={(v) => setForm((f) => ({ ...f, warranty_expiry: v }))} clearable /></Field>
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
