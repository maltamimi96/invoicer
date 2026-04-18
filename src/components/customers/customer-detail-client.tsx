"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Plus, Edit, Mail, Phone, Building2, MapPin, FileText,
  FileCheck, Wrench, ClipboardList, StickyNote, User, Users, Home,
  Trash2, Star, Save, X, ChevronDown, ChevronUp, ImageIcon, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  createCustomerProperty, updateCustomerProperty, deleteCustomerProperty,
  createCustomerContact, updateCustomerContact, deleteCustomerContact,
  createCustomerNote, deleteCustomerNote,
} from "@/lib/actions/customer-hub";
import type {
  Customer, InvoiceWithCustomer, QuoteWithCustomer,
  WorkOrderWithCustomer, ReportWithCustomer,
  CustomerProperty, CustomerContact, CustomerNote,
} from "@/types/database";

interface Props {
  customer: Customer;
  invoices: InvoiceWithCustomer[];
  quotes: QuoteWithCustomer[];
  workOrders: WorkOrderWithCustomer[];
  reports: ReportWithCustomer[];
  properties: CustomerProperty[];
  contacts: CustomerContact[];
  notes: CustomerNote[];
  currency?: string;
}

// ── Property Modal ─────────────────────────────────────────────────────────────

interface PropertyModalProps {
  customerId: string;
  property?: CustomerProperty;
  onSave: (p: CustomerProperty) => void;
  onClose: () => void;
}

function PropertyModal({ customerId, property, onSave, onClose }: PropertyModalProps) {
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    label: property?.label ?? "",
    address: property?.address ?? "",
    city: property?.city ?? "",
    postcode: property?.postcode ?? "",
    country: property?.country ?? "",
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
              postcode: form.postcode || null,
              country: form.country || null,
              notes: form.notes || null,
            })
          : await createCustomerProperty(customerId, {
              label: form.label || undefined,
              address: form.address,
              city: form.city || undefined,
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
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Label</Label>
              <Input placeholder="e.g. Main Residence, Investment Property" value={form.label} onChange={f("label")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Street address *</Label>
              <Input placeholder="123 High Street" value={form.address} onChange={f("address")} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input placeholder="Sydney" value={form.city} onChange={f("city")} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input placeholder="2000" value={form.postcode} onChange={f("postcode")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Country</Label>
              <Input placeholder="Australia" value={form.country} onChange={f("country")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Access info, site notes..." rows={2} value={form.notes} onChange={f("notes")} />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
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
  currency = "AUD",
}: Props) {
  const [customer, setCustomer] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [properties, setProperties] = useState(initialProperties);
  const [contacts, setContacts] = useState(initialContacts);
  const [notes, setNotes] = useState(initialNotes);

  // Modals
  const [propertyModal, setPropertyModal] = useState<{ open: boolean; item?: CustomerProperty }>({ open: false });
  const [contactModal, setContactModal] = useState<{ open: boolean; item?: CustomerContact }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "property" | "contact" | "note"; id: string } | null>(null);

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
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{customer.name}</h1>
          {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
            <Edit className="w-3.5 h-3.5 mr-1.5" />{editing ? "Cancel" : "Edit"}
          </Button>
          <Link href={`/invoices/new?customer=${customer.id}`}>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />New invoice</Button>
          </Link>
        </div>
      </motion.div>

      {editing ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <CustomerForm customer={customer} onSuccess={(updated) => { setCustomer(updated); setEditing(false); }} />
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Left sidebar */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total spent", value: formatCurrency(totalSpent, currency) },
                { label: "Outstanding", value: formatCurrency(outstanding, currency) },
                { label: "Work orders", value: initialWorkOrders.length },
                { label: "Invoices", value: invoices.length },
                { label: "Quotes", value: quotes.length },
                { label: "Properties", value: properties.length },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground leading-tight mb-1">{s.label}</p>
                    <p className="font-semibold text-sm">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Contact info */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Primary contact</h3>
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${customer.email}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{customer.email}</a>
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
              </CardContent>
            </Card>

            {/* Quick actions */}
            <div className="space-y-2">
              <Link href={`/work-orders/new?customer=${customer.id}`} className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Wrench className="w-3.5 h-3.5" />New work order
                </Button>
              </Link>
              <Link href={`/quotes/new?customer=${customer.id}`} className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <FileCheck className="w-3.5 h-3.5" />New quote
                </Button>
              </Link>
              <Link href={`/invoices/new?customer=${customer.id}`} className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <FileText className="w-3.5 h-3.5" />New invoice
                </Button>
              </Link>
              {customer.phone && (
                <Link href={`/messages?phone=${encodeURIComponent(customer.phone)}&name=${encodeURIComponent(customer.name)}&customer=${customer.id}`} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5" />Send message
                  </Button>
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
                <TabsTrigger value="notes" className="gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" />Notes ({notes.length})
                </TabsTrigger>
              </TabsList>

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
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPropertyModal({ open: true, item: prop })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "property", id: prop.id })}>
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
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setContactModal({ open: true, item: c })}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "contact", id: c.id })}>
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
                            size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
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
