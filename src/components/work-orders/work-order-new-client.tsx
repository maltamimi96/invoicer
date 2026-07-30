"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Check, ChevronDown } from "@/components/ui/icons";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ClientSelect } from "@/components/customers/client-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AddressSelect } from "@/components/addresses/address-select";
import { createWorkOrder } from "@/lib/actions/work-orders";
import { getSitesForAccount, getSite } from "@/lib/actions/sites";
import { getContactsForAccount } from "@/lib/actions/account-contacts";
import { getBillingProfilesForAccount, getSiteBilling } from "@/lib/actions/billing-profiles";
import type { Customer, MemberProfile, Site, AccountContact, BillingProfile } from "@/types/database";

const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-pink-500","bg-orange-500",
  "bg-teal-500","bg-cyan-500","bg-rose-500","bg-amber-500",
];
function avatarColor(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

interface WorkOrderNewClientProps {
  customers: Customer[];
  profiles: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  templates?: import("@/types/database").WorkOrderTemplate[];
  defaultCustomerId?: string;
  defaultSiteId?: string;
  defaultSiteAddress?: string;
}

export function WorkOrderNewClient({
  customers: initialCustomers, profiles, templates = [], defaultCustomerId, defaultSiteId, defaultSiteAddress,
}: WorkOrderNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customers, setCustomers] = useState(initialCustomers);

  const [title,            setTitle]            = useState("");
  const [description,      setDescription]      = useState("");
  const [reportedIssue,    setReportedIssue]    = useState("");
  // Templated fields carried through to createWorkOrder (no inline editor here).
  const [scopeOfWork,      setScopeOfWork]      = useState<string | null>(null);
  const [workerNotes,      setWorkerNotes]      = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [customerId,       setCustomerId]       = useState(defaultCustomerId ?? "");
  const [propertyAddress,  setPropertyAddress]  = useState(defaultSiteAddress ?? "");
  const [scheduledDate,    setScheduledDate]    = useState("");
  const [startTime,        setStartTime]        = useState("");
  const [endTime,          setEndTime]          = useState("");
  const [selectedWorkers,  setSelectedWorkers]  = useState<string[]>([]);
  const [workerOpen,       setWorkerOpen]       = useState(false);

  // Account-driven selectors
  const [sites, setSites] = useState<Site[]>([]);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [billingProfiles, setBillingProfiles] = useState<BillingProfile[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [siteId, setSiteId] = useState<string>(defaultSiteId ?? "");
  const [bookerContactId, setBookerContactId] = useState<string>("");
  const [onsiteContactId, setOnsiteContactId] = useState<string>("");
  const [billingProfileId, setBillingProfileId] = useState<string>("");

  // Load sites/contacts/billing whenever customer changes
  useEffect(() => {
    let cancelled = false;
    const accountId = customerId && customerId !== "none" ? customerId : null;
    if (!accountId) {
      setSites([]); setContacts([]); setBillingProfiles([]);
      setSiteId(""); setBookerContactId(""); setOnsiteContactId(""); setBillingProfileId("");
      setAccountLoading(false);
      return;
    }
    setAccountLoading(true);
    (async () => {
      try {
        const [s, c, b] = await Promise.all([
          getSitesForAccount(accountId),
          getContactsForAccount(accountId),
          getBillingProfilesForAccount(accountId),
        ]);
        if (cancelled) return;
        setSites(s);
        setContacts(c);
        setBillingProfiles(b);

        // Auto-select primary contact as booker if none set
        const primary = c.find((x) => x.role === "primary") ?? c[0];
        if (primary && !bookerContactId) setBookerContactId(primary.id);

        // Auto-select default billing profile
        const def = b.find((x) => x.is_default) ?? b[0];
        if (def && !billingProfileId) setBillingProfileId(def.id);

        // Auto-select single site
        if (!siteId && s.length === 1) setSiteId(s[0].id);

        // Prefill property address from the customer record itself if:
        //  - no site has been auto-selected (the site effect below would overwrite this anyway)
        //  - the address field is currently empty (don't stomp on user input)
        if (s.length !== 1 && !propertyAddress.trim()) {
          const cust = customers.find((x) => x.id === accountId);
          if (cust) {
            const composed = [cust.address, cust.city, cust.state, cust.postcode, cust.country]
              .filter(Boolean).join(", ");
            if (composed) setPropertyAddress(composed);
          }
        }
      } catch (e) {
        console.error("Failed to load account context", e);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // When site changes, prefill address + override billing if site has its own
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, sb] = await Promise.all([getSite(siteId), getSiteBilling(siteId)]);
        if (cancelled) return;
        if (s) {
          const composed = [s.address, s.city, s.postcode, s.country].filter(Boolean).join(", ");
          if (composed) setPropertyAddress(composed);
        }
        if (sb?.billing_profile_id) setBillingProfileId(sb.billing_profile_id);
      } catch (e) {
        console.error("Failed to load site", e);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const toggleWorker = (id: string) =>
    setSelectedWorkers((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);

  const selectedProfiles = profiles.filter((p) => selectedWorkers.includes(p.id));

  function applyTemplate(id: string | null) {
    setActiveTemplateId(id);
    if (!id) { setScopeOfWork(null); setWorkerNotes(null); return; }
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Only prefill empty fields so we never clobber what the user has typed.
    if (!title.trim()         && t.title)          setTitle(t.title);
    if (!description.trim()   && t.description)    setDescription(t.description);
    if (!reportedIssue.trim() && t.reported_issue) setReportedIssue(t.reported_issue);
    setScopeOfWork(t.scope_of_work);
    setWorkerNotes(t.worker_notes);
    // If a start time is already set and the template has a duration, compute end.
    if (t.default_duration_minutes && startTime && !endTime) {
      const [h, m] = startTime.split(":").map(Number);
      const total = h * 60 + (m || 0) + t.default_duration_minutes;
      const eh = Math.min(23, Math.floor(total / 60));
      const em = total % 60;
      setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
    }
  }

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    startTransition(async () => {
      try {
        const firstProfile = selectedProfiles[0];
        const wo = await createWorkOrder({
          title: title.trim(),
          description: description.trim() || undefined,
          reported_issue: reportedIssue.trim() || null,
          scope_of_work: scopeOfWork || null,
          worker_notes: workerNotes || null,
          customer_id: customerId && customerId !== "none" ? customerId : null,
          site_id: siteId || null,
          booker_contact_id: bookerContactId || null,
          onsite_contact_id: onsiteContactId || null,
          billing_profile_id: billingProfileId || null,
          property_address: propertyAddress.trim() || undefined,
          scheduled_date: scheduledDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          // assigned_to is a UUID FK to auth.users — leave null when assigning via
          // member_profile (profile id + email below already capture the worker).
          assigned_to: null,
          assigned_to_email: firstProfile?.email ?? null,
          assigned_to_profile_id: firstProfile?.id ?? null,
          member_profile_ids: selectedWorkers,
        });
        toast.success(`${wo.number} created`);
        router.push(`/work-orders/${wo.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create");
      }
    });
  };

  const accountSelected = customerId && customerId !== "none";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="New work order"
        subtitle="Assign a job to your team — they'll submit photos from site"
        accent="linear-gradient(180deg, #fbbf24 0%, #b45309 100%)"
      />

      {templates.length > 0 && (
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Start from</span>
              <button type="button" onClick={() => applyTemplate(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${activeTemplateId === null ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
                Blank
              </button>
              {templates.map((t) => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${activeTemplateId === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
                  {t.name}
                </button>
              ))}
              <a href="/settings/work-order-templates" className="ml-auto text-xs text-primary hover:underline">Manage templates</a>
            </div>
            {activeTemplateId !== null && <p className="text-xs text-muted-foreground mt-2">Prefilled from this template — edit anything below before saving.</p>}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="e.g. Roof repair — 102 Smith St" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Reported issue</Label>
            <Textarea
              rows={2}
              placeholder="What did the customer report? (e.g. 'Leak in master bedroom ceiling after last storm')"
              value={reportedIssue}
              onChange={(e) => setReportedIssue(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Instructions for worker</Label>
            <Textarea
              rows={3}
              placeholder="Describe what needs to be done. The worker will see this on-site."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Account → Site → Roles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <ClientSelect
                customers={customers}
                value={customerId}
                onValueChange={setCustomerId}
                onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
              />
            </div>

            <div className="sm:col-span-2">
              <AddressSelect
                customer={customers.find((c) => c.id === customerId) ?? null}
                sites={sites}
                value={{ site_id: siteId || null, property_address: propertyAddress }}
                onChange={(v) => { setSiteId(v.site_id ?? ""); setPropertyAddress(v.property_address); }}
                label="Property address"
              />
            </div>

            {accountSelected && accountLoading && contacts.length === 0 && billingProfiles.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-xl bg-muted/40 border border-border px-3 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading customer details…
              </div>
            )}

            {accountSelected && contacts.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Booker (who requested the job)</Label>
                  <SearchableSelect
                    items={contacts.map((c) => ({
                      value: c.id,
                      label: c.name,
                      sublabel: c.role || undefined,
                      keywords: [c.email, c.phone, c.role].filter(Boolean).join(" "),
                    }))}
                    value={bookerContactId}
                    onValueChange={setBookerContactId}
                    placeholder="Select contact"
                    searchPlaceholder="Search contacts..."
                    allowNone noneLabel="— None —"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>On-site contact</Label>
                  <SearchableSelect
                    items={contacts.map((c) => ({
                      value: c.id,
                      label: c.name,
                      sublabel: c.role || undefined,
                      keywords: [c.email, c.phone, c.role].filter(Boolean).join(" "),
                    }))}
                    value={onsiteContactId}
                    onValueChange={setOnsiteContactId}
                    placeholder="Select contact"
                    searchPlaceholder="Search contacts..."
                    allowNone noneLabel="— None —"
                  />
                </div>
              </>
            )}

            {accountSelected && billingProfiles.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bill to</Label>
                <SearchableSelect
                  items={billingProfiles.map((b) => ({
                    value: b.id,
                    label: b.name + (b.is_default ? " (default)" : ""),
                    keywords: b.name,
                  }))}
                  value={billingProfileId}
                  onValueChange={setBillingProfileId}
                  placeholder="Select billing profile"
                  searchPlaceholder="Search billing profiles..."
                  allowNone noneLabel="— None —"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <DatePicker value={scheduledDate} onChange={setScheduledDate} clearable />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <TimePicker value={startTime} onChange={setStartTime} clearable />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <TimePicker value={endTime} onChange={setEndTime} clearable />
              </div>
            </div>
          </div>

          {/* Multi-worker selector */}
          <div className="space-y-2">
            <Label>Assign Workers</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkerOpen(!workerOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
              >
                <span className="text-muted-foreground">
                  {selectedProfiles.length === 0
                    ? "Select workers..."
                    : `${selectedProfiles.length} worker${selectedProfiles.length > 1 ? "s" : ""} selected`}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {workerOpen && (
                <div className="absolute z-50 top-full mt-1 w-full border rounded-md bg-popover shadow-md overflow-hidden">
                  {profiles.map((p) => {
                    const selected = selectedWorkers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleWorker(p.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors text-left"
                      >
                        <div className={`h-7 w-7 rounded-full ${avatarColor(p.id)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {initials(p.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.role_title && <p className="text-xs text-muted-foreground">{p.role_title}</p>}
                        </div>
                        {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  {profiles.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No workers — add team members first</p>
                  )}
                </div>
              )}
            </div>
            {selectedProfiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2.5 py-0.5">
                    <div className={`h-5 w-5 rounded-full ${avatarColor(p.id)} flex items-center justify-center text-white text-[9px] font-bold`}>
                      {initials(p.name)}
                    </div>
                    <span className="text-xs font-medium">{p.name}</span>
                    <button type="button" onClick={() => toggleWorker(p.id)} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/work-orders"><Button variant="outline">Cancel</Button></Link>
        <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
          {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Work Order"}
        </Button>
      </div>
    </div>
  );
}
