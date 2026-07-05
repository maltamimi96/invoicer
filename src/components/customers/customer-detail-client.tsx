"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus, Edit, Mail, Phone, Building2, MapPin, FileText,
  FileCheck, Wrench, ClipboardList, StickyNote, User, Users, Home,
  Trash2, Star, Save, X, ChevronDown, ChevronUp, ImageIcon, MessageSquare,
  CreditCard, DollarSign,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DetailHero, StatTile, AnimatedPress, FadeIn, KireiAvatar, GradientTile,
} from "@/components/ui/kirei";
import { AddressFields } from "@/components/addresses/address-fields";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { AddressLink, MapPinLink } from "@/components/ui/address-link";
import { CustomerForm } from "./customer-form";
import { PortalLinkButton } from "@/components/customer-portal/portal-link-button";
import {
  createCustomerProperty, updateCustomerProperty, deleteCustomerProperty,
  createCustomerContact, updateCustomerContact, deleteCustomerContact,
  createCustomerNote, deleteCustomerNote,
} from "@/lib/actions/customer-hub";
import {
  createBillingProfile, updateBillingProfile, archiveBillingProfile,
  type BillingProfilePayload,
} from "@/lib/actions/billing-profiles";
import { CustomerOnboardingCard } from "@/components/onboarding/customer-onboarding-card";
import type { OnboardingRequestRow } from "@/lib/actions/onboarding";
import type {
  Customer, InvoiceWithCustomer, QuoteWithCustomer,
  WorkOrderWithCustomer, ReportWithCustomer,
  CustomerProperty, CustomerContact, CustomerNote, BillingProfile,
  OnboardingForm, OnboardingResponse,
} from "@/types/database";

/** Onboarding tab payload — null hides the tab (plugin disabled). */
export interface CustomerOnboardingData {
  requests: OnboardingRequestRow[];
  responses: OnboardingResponse[];
  activeForms: Pick<OnboardingForm, "id" | "name">[];
}

interface Props {
  customer: Customer;
  invoices: InvoiceWithCustomer[];
  quotes: QuoteWithCustomer[];
  workOrders: WorkOrderWithCustomer[];
  reports: ReportWithCustomer[];
  properties: CustomerProperty[];
  contacts: CustomerContact[];
  notes: CustomerNote[];
  billingProfiles: BillingProfile[];
  currency?: string;
  /** Country of the active business — drives address-field layout. */
  businessCountry?: string | null;
  /** Client-onboarding tab data; null/undefined when the plugin is disabled. */
  onboarding?: CustomerOnboardingData | null;
}

// ── Property Modal ─────────────────────────────────────────────────────────────

interface PropertyModalProps {
  customerId: string;
  property?: CustomerProperty;
  /** Country of the active business — drives the address field layout. */
  businessCountry?: string | null;
  onSave: (p: CustomerProperty) => void;
  onClose: () => void;
}

function PropertyModal({ customerId, property, businessCountry, onSave, onClose }: PropertyModalProps) {
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    label: property?.label ?? "",
    address: property?.address ?? "",
    city: property?.city ?? "",
    state: (property as { state?: string } | undefined)?.state ?? "",
    postcode: property?.postcode ?? "",
    country: property?.country ?? (businessCountry ?? ""),
    notes: property?.notes ?? "",
  });

  const handleSave = () => {
    if (!form.address.trim()) { toast.error("Address is required"); return; }
    start(async () => {
      try {
        const saved = property
          ? await updateCustomerProperty(property.id, customerId, {
              label: form.label || null,
              address: form.address,
              city: form.city || null,
              state: form.state || null,
              postcode: form.postcode || null,
              country: form.country || null,
              notes: form.notes || null,
            })
          : await createCustomerProperty(customerId, {
              label: form.label || undefined,
              address: form.address,
              city: form.city || undefined,
              state: form.state || undefined,
              postcode: form.postcode || undefined,
              country: form.country || undefined,
              notes: form.notes || undefined,
            });
        toast.success(property ? "Property updated" : "Property added");
        onSave(saved);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{property ? "Edit property" : "Add property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input placeholder="e.g. Main Residence, Investment Property" value={form.label} onChange={f("label")} />
          </div>
          <AddressFields
            country={businessCountry}
            values={{
              address: form.address, city: form.city, state: form.state,
              postcode: form.postcode, country: form.country,
            }}
            onChange={(next) => setForm((p) => ({
              ...p,
              address: next.address, city: next.city, state: next.state,
              postcode: next.postcode, country: next.country,
            }))}
          />
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Access info, site notes..." rows={2} value={form.notes} onChange={f("notes")} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={isPending} onClick={handleSave}>
              {property ? "Save changes" : "Add property"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Contact Modal ──────────────────────────────────────────────────────────────

interface ContactModalProps {
  customerId: string;
  contact?: CustomerContact;
  onSave: (c: CustomerContact) => void;
  onClose: () => void;
}

function ContactModal({ customerId, contact, onSave, onClose }: ContactModalProps) {
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    is_primary: contact?.is_primary ?? false,
    notes: contact?.notes ?? "",
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    start(async () => {
      try {
        const saved = contact
          ? await updateCustomerContact(contact.id, customerId, {
              name: form.name,
              role: form.role || null,
              email: form.email || null,
              phone: form.phone || null,
              is_primary: form.is_primary,
              notes: form.notes || null,
            })
          : await createCustomerContact(customerId, {
              name: form.name,
              role: form.role || undefined,
              email: form.email || undefined,
              phone: form.phone || undefined,
              is_primary: form.is_primary,
              notes: form.notes || undefined,
            });
        toast.success(contact ? "Contact updated" : "Contact added");
        onSave(saved);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  const f = (k: keyof Omit<typeof form, "is_primary">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="Jane Smith" value={form.name} onChange={f("name")} autoFocus />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Role</Label>
              <Input placeholder="e.g. Site Manager, Owner, Accounts" value={form.role} onChange={f("role")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="jane@acme.com" value={form.email} onChange={f("email")} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+61 400 000 000" value={form.phone} onChange={f("phone")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Any relevant notes about this contact..." rows={2} value={form.notes} onChange={f("notes")} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_primary"
                checked={form.is_primary}
                onChange={(e) => setForm((p) => ({ ...p, is_primary: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="is_primary" className="cursor-pointer">Primary contact</Label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={isPending} onClick={handleSave}>
              {contact ? "Save changes" : "Add contact"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Work Order Card ────────────────────────────────────────────────────────────

function WorkOrderCard({ wo, currency }: { wo: WorkOrderWithCustomer; currency: string }) {
  const [expanded, setExpanded] = useState(false);
  const photos = wo.photos ?? [];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/work-orders/${wo.id}`} className="font-medium text-sm hover:underline">
                {wo.number} — {wo.title}
              </Link>
              <Badge variant="secondary" className={`text-xs ${getStatusColor(wo.status)}`}>{wo.status.replace("_", " ")}</Badge>
            </div>
            {wo.property_address && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <MapPinLink address={wo.property_address} />
                {wo.property_address}
              </p>
            )}
            {wo.scheduled_date && (
              <p className="text-xs text-muted-foreground">Scheduled: {formatDate(wo.scheduled_date)}</p>
            )}
          </div>
          {photos.length > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {photos.length}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
        {expanded && photos.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 px-3 pb-3">
            {photos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="w-full h-full object-cover rounded border hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Billing Profile Modal ──────────────────────────────────────────────────────

interface BillingProfileModalProps {
  customerId: string;
  profile?: BillingProfile;
  onSave: (p: BillingProfile) => void;
  onClose: () => void;
}

function BillingProfileModal({ customerId, profile, onSave, onClose }: BillingProfileModalProps) {
  const [form, setForm] = useState<BillingProfilePayload>({
    name: profile?.name ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    city: profile?.city ?? "",
    postcode: profile?.postcode ?? "",
    country: profile?.country ?? "",
    tax_number: profile?.tax_number ?? "",
    payment_terms: profile?.payment_terms ?? "",
    notes: profile?.notes ?? "",
    is_default: profile?.is_default ?? false,
  });
  const [saving, start] = useTransition();
  const f = (k: keyof BillingProfilePayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      try {
        const payload: BillingProfilePayload = {
          ...form,
          name: form.name.trim(),
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          city: form.city || null,
          postcode: form.postcode || null,
          country: form.country || null,
          tax_number: form.tax_number || null,
          payment_terms: form.payment_terms || null,
          notes: form.notes || null,
        };
        const saved = profile
          ? await updateBillingProfile(profile.id, payload)
          : await createBillingProfile(customerId, payload);
        onSave(saved);
        toast.success(profile ? "Billing profile updated" : "Billing profile added");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit billing profile" : "Add billing profile"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input placeholder="e.g. Head Office, Strata Plan 1234" value={form.name} onChange={f("name")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" placeholder="accounts@..." value={form.email ?? ""} onChange={f("email")} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone ?? ""} onChange={f("phone")} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input value={form.address ?? ""} onChange={f("address")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">City</Label>
              <Input value={form.city ?? ""} onChange={f("city")} />
            </div>
            <div>
              <Label className="text-xs">Postcode</Label>
              <Input value={form.postcode ?? ""} onChange={f("postcode")} />
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <Input value={form.country ?? ""} onChange={f("country")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tax / ABN</Label>
              <Input value={form.tax_number ?? ""} onChange={f("tax_number")} />
            </div>
            <div>
              <Label className="text-xs">Payment terms</Label>
              <Input placeholder="Net 30" value={form.payment_terms ?? ""} onChange={f("payment_terms")} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={f("notes")} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.is_default}
              onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
            />
            Default billing profile for this customer
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>{profile ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function CustomerDetailClient({
  customer: initial,
  invoices,
  quotes,
  workOrders: initialWorkOrders,
  reports,
  properties: initialProperties,
  contacts: initialContacts,
  notes: initialNotes,
  billingProfiles: initialBillingProfiles,
  currency = "AUD",
  businessCountry = null,
  onboarding = null,
}: Props) {
  const [customer, setCustomer] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [properties, setProperties] = useState(initialProperties);
  const [contacts, setContacts] = useState(initialContacts);
  const [notes, setNotes] = useState(initialNotes);
  const [billingProfiles, setBillingProfiles] = useState(initialBillingProfiles);

  // Modals
  const [propertyModal, setPropertyModal] = useState<{ open: boolean; item?: CustomerProperty }>({ open: false });
  const [contactModal, setContactModal] = useState<{ open: boolean; item?: CustomerContact }>({ open: false });
  const [billingModal, setBillingModal] = useState<{ open: boolean; item?: BillingProfile }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "property" | "contact" | "note" | "billing"; id: string } | null>(null);

  // New note
  const [noteText, setNoteText] = useState("");
  const [savingNote, startNote] = useTransition();
  const [, startDelete] = useTransition();

  const totalSpent = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter(i => ["sent", "partial"].includes(i.status)).reduce((s, i) => s + (i.total - i.amount_paid), 0);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    startNote(async () => {
      try {
        const note = await createCustomerNote(customer.id, noteText.trim());
        setNotes((p) => [note, ...p]);
        setNoteText("");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save note");
      }
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        if (deleteTarget.type === "property") {
          await deleteCustomerProperty(deleteTarget.id, customer.id);
          setProperties((p) => p.filter((x) => x.id !== deleteTarget.id));
        } else if (deleteTarget.type === "contact") {
          await deleteCustomerContact(deleteTarget.id, customer.id);
          setContacts((p) => p.filter((x) => x.id !== deleteTarget.id));
        } else if (deleteTarget.type === "billing") {
          await archiveBillingProfile(deleteTarget.id);
          setBillingProfiles((p) => p.filter((x) => x.id !== deleteTarget.id));
        } else {
          await deleteCustomerNote(deleteTarget.id, customer.id);
          setNotes((p) => p.filter((x) => x.id !== deleteTarget.id));
        }
        toast.success("Deleted");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleteTarget(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <DetailHero
        backHref="/customers"
        title={customer.name}
        subtitle={customer.company ?? undefined}
        icon={<KireiAvatar name={customer.name} size={52} radius={14} />}
        status={customer.archived ? "archived" : "active"}
        actions={
          <>
            <AnimatedPress
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
            >
              <Edit className="w-4 h-4" /> {editing ? "Cancel" : "Edit"}
            </AnimatedPress>
            <PortalLinkButton customerId={customer.id} customerName={customer.name} customerPhone={customer.phone ?? null} />
            <Link href={`/invoices/new?customer=${customer.id}`}>
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer">
                <Plus className="w-4 h-4" /> New invoice
              </AnimatedPress>
            </Link>
          </>
        }
      />

      {editing ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <CustomerForm customer={customer} businessCountry={businessCountry} onSuccess={(updated) => { setCustomer(updated); setEditing(false); }} />
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Left sidebar */}
          <div className="space-y-4">
            {/* Stat tiles */}
            <FadeIn delay={60}>
              <div className="grid grid-cols-2 gap-2">
                <StatTile gradient="softTeal"   toneColor="#1f4f4a" icon={<DollarSign  className="w-3 h-3" />} label="Total spent" value={formatCurrency(totalSpent, currency)} />
                <StatTile gradient="softAmber"  toneColor="#78350f" icon={<DollarSign  className="w-3 h-3" />} label="Outstanding" value={formatCurrency(outstanding, currency)} />
                <StatTile gradient="softBlue"   toneColor="#1e3a8a" icon={<Wrench      className="w-3 h-3" />} label="Work orders" value={String(initialWorkOrders.length)} />
                <StatTile gradient="softTeal"   toneColor="#064e3b" icon={<FileText    className="w-3 h-3" />} label="Invoices"    value={String(invoices.length)} />
                <StatTile gradient="softViolet" toneColor="#3b1d6b" icon={<FileCheck   className="w-3 h-3" />} label="Quotes"      value={String(quotes.length)} />
                <StatTile gradient="softRose"   toneColor="#9f1239" icon={<Home        className="w-3 h-3" />} label="Properties"  value={String(properties.length)} />
              </div>
            </FadeIn>

            {/* Contact info */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                <GradientTile gradient="primary" size={28} radius={8}>
                  <User className="w-3.5 h-3.5" />
                </GradientTile>
                <h3 className="text-sm font-semibold">Primary contact</h3>
              </div>
              <div className="p-4 space-y-3">
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${customer.email}`} className="text-primary hover:underline break-words">{customer.email}</a>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{customer.company}</span>
                  </div>
                )}
                {(customer.address || customer.city) && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPinLink address={[customer.address, customer.city, customer.postcode, customer.country].filter(Boolean).join(", ")} />
                    <span className="text-muted-foreground">
                      {[customer.address, customer.city, customer.postcode, customer.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {customer.tax_number && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Tax:</span> {customer.tax_number}
                  </div>
                )}
                {customer.notes && (
                  <>
                    <Separator />
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{customer.notes}</p>
                  </>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <Link href={`/work-orders/new?customer=${customer.id}`} className="block">
                <AnimatedPress className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium cursor-pointer">
                  <GradientTile gradient="amber" size={24} radius={6}><Wrench className="w-3 h-3" /></GradientTile>
                  New work order
                </AnimatedPress>
              </Link>
              <Link href={`/quotes/new?customer=${customer.id}`} className="block">
                <AnimatedPress className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium cursor-pointer">
                  <GradientTile gradient="violet" size={24} radius={6}><FileCheck className="w-3 h-3" /></GradientTile>
                  New quote
                </AnimatedPress>
              </Link>
              <Link href={`/invoices/new?customer=${customer.id}`} className="block">
                <AnimatedPress className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium cursor-pointer">
                  <GradientTile gradient="emerald" size={24} radius={6}><FileText className="w-3 h-3" /></GradientTile>
                  New invoice
                </AnimatedPress>
              </Link>
              {customer.phone && (
                <Link href={`/messages?phone=${encodeURIComponent(customer.phone)}&name=${encodeURIComponent(customer.name)}&customer=${customer.id}`} className="block">
                  <AnimatedPress className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium cursor-pointer">
                    <GradientTile gradient="blue" size={24} radius={6}><MessageSquare className="w-3 h-3" /></GradientTile>
                    Send message
                  </AnimatedPress>
                </Link>
              )}
            </div>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="properties">
              <TabsList className="w-full flex-wrap h-auto gap-1 mb-1">
                <TabsTrigger value="properties" className="gap-1.5">
                  <Home className="w-3.5 h-3.5" />Properties ({properties.length})
                </TabsTrigger>
                <TabsTrigger value="contacts" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" />Contacts ({contacts.length})
                </TabsTrigger>
                <TabsTrigger value="work-orders" className="gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />Jobs ({initialWorkOrders.length})
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" />Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="quotes" className="gap-1.5">
                  <FileCheck className="w-3.5 h-3.5" />Quotes ({quotes.length})
                </TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />Reports ({reports.length})
                </TabsTrigger>
                <TabsTrigger value="billing" className="gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />Billing ({billingProfiles.length})
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" />Notes ({notes.length})
                </TabsTrigger>
                {onboarding && (
                  <TabsTrigger value="onboarding" className="gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />Onboarding ({onboarding.requests.length})
                  </TabsTrigger>
                )}
              </TabsList>

              {/* ── Onboarding ── */}
              {onboarding && (
                <TabsContent value="onboarding" className="mt-3">
                  <CustomerOnboardingCard
                    customerId={customer.id}
                    requests={onboarding.requests}
                    responses={onboarding.responses}
                    activeForms={onboarding.activeForms}
                  />
                </TabsContent>
              )}

              {/* ── Properties ── */}
              <TabsContent value="properties" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPropertyModal({ open: true })}>
                    <Plus className="w-3.5 h-3.5" />Add property
                  </Button>
                </div>
                {properties.length === 0 ? (
                  <EmptyState icon={<Home className="w-8 h-8" />} text="No properties yet" />
                ) : properties.map((prop) => (
                  <Card key={prop.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          {prop.label && <p className="text-xs font-medium text-primary uppercase tracking-wide">{prop.label}</p>}
                          <p className="font-medium text-sm">
                            <AddressLink
                              address={[prop.address, prop.city, prop.postcode, prop.country].filter(Boolean).join(", ")}
                            />
                          </p>
                          {prop.notes && <p className="text-xs text-muted-foreground mt-1 italic">{prop.notes}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Link href={`/sites/${prop.id}`}>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Open</Button>
                          </Link>
                          <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => setPropertyModal({ open: true, item: prop })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "property", id: prop.id })}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Jobs at this property */}
                      {(() => {
                        const propJobs = initialWorkOrders.filter((w) =>
                          w.property_address?.toLowerCase().includes(prop.address.toLowerCase())
                        );
                        if (propJobs.length === 0) return null;
                        return (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-2">{propJobs.length} job{propJobs.length !== 1 ? "s" : ""} at this address</p>
                            <div className="space-y-1">
                              {propJobs.map((j) => (
                                <Link key={j.id} href={`/work-orders/${j.id}`} className="flex items-center gap-2 text-xs hover:underline text-muted-foreground hover:text-foreground">
                                  <Wrench className="w-3 h-3" />{j.number} — {j.title}
                                  <Badge variant="secondary" className={`text-xs ml-auto ${getStatusColor(j.status)}`}>{j.status.replace("_", " ")}</Badge>
                                </Link>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* ── Contacts ── */}
              <TabsContent value="contacts" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setContactModal({ open: true })}>
                    <Plus className="w-3.5 h-3.5" />Add contact
                  </Button>
                </div>
                {contacts.length === 0 ? (
                  <EmptyState icon={<Users className="w-8 h-8" />} text="No contacts yet" />
                ) : contacts.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{c.name}</p>
                            {c.is_primary && (
                              <Badge variant="secondary" className="text-xs gap-0.5">
                                <Star className="w-2.5 h-2.5" />Primary
                              </Badge>
                            )}
                          </div>
                          {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                              <Mail className="w-3 h-3" />{c.email}
                            </a>
                          )}
                          {c.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />{c.phone}
                            </p>
                          )}
                          {c.notes && <p className="text-xs text-muted-foreground italic mt-1">{c.notes}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => setContactModal({ open: true, item: c })}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "contact", id: c.id })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* ── Work Orders ── */}
              <TabsContent value="work-orders" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Link href={`/work-orders/new?customer=${customer.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />New work order
                    </Button>
                  </Link>
                </div>
                {initialWorkOrders.length === 0 ? (
                  <EmptyState icon={<Wrench className="w-8 h-8" />} text="No work orders yet" />
                ) : initialWorkOrders.map((wo) => (
                  <WorkOrderCard key={wo.id} wo={wo} currency={currency} />
                ))}
              </TabsContent>

              {/* ── Invoices ── */}
              <TabsContent value="invoices" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Link href={`/invoices/new?customer=${customer.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />New invoice
                    </Button>
                  </Link>
                </div>
                {invoices.length === 0 ? (
                  <EmptyState icon={<FileText className="w-8 h-8" />} text="No invoices yet" />
                ) : invoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{inv.number}</p>
                          <p className="text-xs text-muted-foreground">Due {formatDate(inv.due_date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(inv.total, currency)}</p>
                          <Badge variant="secondary" className={`text-xs ${getStatusColor(inv.status)}`}>{inv.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </TabsContent>

              {/* ── Quotes ── */}
              <TabsContent value="quotes" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Link href={`/quotes/new?customer=${customer.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />New quote
                    </Button>
                  </Link>
                </div>
                {quotes.length === 0 ? (
                  <EmptyState icon={<FileCheck className="w-8 h-8" />} text="No quotes yet" />
                ) : quotes.map((q) => (
                  <Link key={q.id} href={`/quotes/${q.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{q.number}</p>
                          <p className="text-xs text-muted-foreground">Expires {formatDate(q.expiry_date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(q.total, currency)}</p>
                          <Badge variant="secondary" className={`text-xs ${getStatusColor(q.status)}`}>{q.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </TabsContent>

              {/* ── Reports ── */}
              <TabsContent value="reports" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Link href={`/reports/new?customer=${customer.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />New report
                    </Button>
                  </Link>
                </div>
                {reports.length === 0 ? (
                  <EmptyState icon={<ClipboardList className="w-8 h-8" />} text="No reports yet" />
                ) : reports.map((r) => (
                  <Link key={r.id} href={`/reports/${r.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{r.title}</p>
                          {r.property_address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{r.property_address}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{formatDate(r.report_date)}</p>
                        </div>
                        <Badge variant="secondary" className={`text-xs ${getStatusColor(r.status)}`}>{r.status}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </TabsContent>

              {/* ── Notes ── */}
              {/* ── Billing ── */}
              <TabsContent value="billing" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBillingModal({ open: true })}>
                    <Plus className="w-3.5 h-3.5" />Add billing profile
                  </Button>
                </div>
                {billingProfiles.length === 0 ? (
                  <EmptyState icon={<CreditCard className="w-8 h-8" />} text="No billing profiles yet" />
                ) : billingProfiles.map((bp) => (
                  <Card key={bp.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{bp.name}</p>
                            {bp.is_default && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Star className="w-3 h-3" />Default
                              </Badge>
                            )}
                            {bp.payment_terms && <Badge variant="outline" className="text-xs">{bp.payment_terms}</Badge>}
                          </div>
                          {(bp.email || bp.phone) && (
                            <p className="text-xs text-muted-foreground">
                              {[bp.email, bp.phone].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {[bp.address, bp.city, bp.postcode, bp.country].some(Boolean) && (
                            <p className="text-xs text-muted-foreground">
                              {[bp.address, bp.city, bp.postcode, bp.country].filter(Boolean).join(", ")}
                            </p>
                          )}
                          {bp.tax_number && <p className="text-xs text-muted-foreground">Tax/ABN: {bp.tax_number}</p>}
                          {bp.notes && <p className="text-xs text-muted-foreground italic mt-1">{bp.notes}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => setBillingModal({ open: true, item: bp })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ type: "billing", id: bp.id })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="notes" className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add an internal note..."
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={!noteText.trim() || savingNote} onClick={handleAddNote} className="gap-1.5">
                      <Save className="w-3.5 h-3.5" />Save note
                    </Button>
                  </div>
                </div>
                {notes.length === 0 ? (
                  <EmptyState icon={<StickyNote className="w-8 h-8" />} text="No notes yet" />
                ) : (
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <Card key={n.id}>
                        <CardContent className="p-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">{new Date(n.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                          </div>
                          <Button
                            size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => setDeleteTarget({ type: "note", id: n.id })}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* Property modal */}
      {propertyModal.open && (
        <PropertyModal
          customerId={customer.id}
          property={propertyModal.item}
          businessCountry={businessCountry}
          onSave={(saved) => {
            setProperties((p) =>
              propertyModal.item ? p.map((x) => x.id === saved.id ? saved : x) : [...p, saved]
            );
            setPropertyModal({ open: false });
          }}
          onClose={() => setPropertyModal({ open: false })}
        />
      )}

      {/* Contact modal */}
      {contactModal.open && (
        <ContactModal
          customerId={customer.id}
          contact={contactModal.item}
          onSave={(saved) => {
            setContacts((p) =>
              contactModal.item ? p.map((x) => x.id === saved.id ? saved : x) : [...p, saved]
            );
            setContactModal({ open: false });
          }}
          onClose={() => setContactModal({ open: false })}
        />
      )}

      {/* Billing profile modal */}
      {billingModal.open && (
        <BillingProfileModal
          customerId={customer.id}
          profile={billingModal.item}
          onSave={(saved) => {
            setBillingProfiles((p) => {
              // If saved is default, demote others optimistically
              const next = saved.is_default ? p.map((x) => ({ ...x, is_default: x.id === saved.id })) : p;
              return billingModal.item ? next.map((x) => x.id === saved.id ? saved : x) : [...next, saved];
            });
            setBillingModal({ open: false });
          }}
          onClose={() => setBillingModal({ open: false })}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
      <div className="opacity-30">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
