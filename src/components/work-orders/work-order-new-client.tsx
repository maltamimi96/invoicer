"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClientSelect } from "@/components/customers/client-select";
import { createWorkOrder } from "@/lib/actions/work-orders";
import { getSitesForAccount, getSite } from "@/lib/actions/sites";
import { getContactsForAccount } from "@/lib/actions/contacts";
import { getBillingProfilesForAccount, getSiteBilling } from "@/lib/actions/billing-profiles";
import type { Customer, MemberProfile, Site, Contact, BillingProfile } from "@/types/database";

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
  defaultCustomerId?: string;
  defaultSiteId?: string;
  defaultSiteAddress?: string;
}

export function WorkOrderNewClient({
  customers, profiles, defaultCustomerId, defaultSiteId, defaultSiteAddress,
}: WorkOrderNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title,            setTitle]            = useState("");
  const [description,      setDescription]      = useState("");
  const [reportedIssue,    setReportedIssue]    = useState("");
  const [customerId,       setCustomerId]       = useState(defaultCustomerId ?? "");
  const [propertyAddress,  setPropertyAddress]  = useState(defaultSiteAddress ?? "");
  const [scheduledDate,    setScheduledDate]    = useState("");
  const [startTime,        setStartTime]        = useState("");
  const [endTime,          setEndTime]          = useState("");
  const [selectedWorkers,  setSelectedWorkers]  = useState<string[]>([]);
  const [workerOpen,       setWorkerOpen]       = useState(false);

  // Account-driven selectors
  const [sites, setSites] = useState<Site[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [billingProfiles, setBillingProfiles] = useState<BillingProfile[]>([]);
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
      return;
    }
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
      } catch (e) {
        console.error("Failed to load account context", e);
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

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    startTransition(async () => {
      try {
        const firstProfile = selectedProfiles[0];
        const wo = await createWorkOrder({
          title: title.trim(),
          description: description.trim() || undefined,
          reported_issue: reportedIssue.trim() || null,
          customer_id: customerId && customerId !== "none" ? customerId : null,
          site_id: siteId || null,
          booker_contact_id: bookerContactId || null,
          onsite_contact_id: onsiteContactId || null,
          billing_profile_id: billingProfileId || null,
          property_address: propertyAddress.trim() || undefined,
          scheduled_date: scheduledDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          assigned_to: firstProfile?.name ?? null,
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
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Link href="/work-orders">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Work Order</h1>
          <p className="text-sm text-muted-foreground">Assign a job to your team — they&apos;ll submit photos from site</p>
        </div>
      </motion.div>

      <Card>
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
              <ClientSelect customers={customers} value={customerId} onValueChange={setCustomerId} />
            </div>

            {accountSelected && sites.length > 0 && (
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Select value={siteId || "none"} onValueChange={(v) => setSiteId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No site —</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label ?? s.address ?? "Untitled site"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Property Address</Label>
              <Input placeholder="102 Smith St, Sydney NSW" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
            </div>

            {accountSelected && contacts.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Booker (who requested the job)</Label>
                  <Select value={bookerContactId || "none"} onValueChange={(v) => setBookerContactId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.role ? ` (${c.role})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>On-site contact</Label>
                  <Select value={onsiteContactId || "none"} onValueChange={(v) => setOnsiteContactId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.role ? ` (${c.role})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {accountSelected && billingProfiles.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bill to</Label>
                <Select value={billingProfileId || "none"} onValueChange={(v) => setBillingProfileId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select billing profile" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {billingProfiles.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{b.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
