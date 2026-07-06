"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone, Mail, MapPin, Clock, MessageSquare, UserPlus, FileCheck, Wrench, Trash2, User,
} from "@/components/ui/icons";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  updateLeadStatus, deleteLead,
  convertLeadToCustomer, convertLeadToQuote, convertLeadToWorkOrder,
} from "@/lib/actions/leads";
import {
  DetailHero, FactCard, AnimatedPress, FadeIn, KireiAvatar, GradientTile,
} from "@/components/ui/kirei";
import type { GradientName } from "@/components/ui/kirei";
import type { Lead, LeadStatus } from "@/types/database";

const STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];

const STATUS_GRADIENT: Record<LeadStatus, GradientName> = {
  new:       "blue",
  contacted: "amber",
  quoted:    "violet",
  won:       "emerald",
  lost:      "rose",
};

const SOURCE_LABELS: Record<string, string> = {
  "landing-page":   "Landing Page",
  "website":        "Website",
  "referral":       "Referral",
  "telegram":       "Telegram",
  "email":          "Email",
  "phone":          "Phone",
  "manual":         "Manual",
  "hipages":        "HiPages",
  "service-seeking":"ServiceSeeking",
  "google":         "Google",
  "facebook":       "Facebook",
  "instagram":      "Instagram",
  "word-of-mouth":  "Word of mouth",
};
const fmtSource = (s: string | null) =>
  !s ? "—" : (SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

export function LeadDetailClient({ lead: initial }: { lead: Lead }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initial);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setStatus = (status: LeadStatus) => {
    startTransition(async () => {
      try {
        await updateLeadStatus(lead.id, status);
        setLead((prev) => ({ ...prev, status }));
        toast.success(`Marked ${status}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update");
      }
    });
  };

  const convertCustomer = () => {
    startTransition(async () => {
      try {
        const { customer_id } = await convertLeadToCustomer(lead.id);
        toast.success("Customer created");
        router.push(`/customers/${customer_id}`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't convert"); }
    });
  };

  const convertQuote = () => {
    startTransition(async () => {
      try {
        const { quote_id } = await convertLeadToQuote(lead.id);
        toast.success("Draft quote created");
        router.push(`/quotes/${quote_id}`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't convert"); }
    });
  };

  const convertWorkOrder = () => {
    startTransition(async () => {
      try {
        const { work_order_id } = await convertLeadToWorkOrder(lead.id);
        toast.success("Job created");
        router.push(`/work-orders/${work_order_id}`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't convert"); }
    });
  };

  const remove = () => {
    startTransition(async () => {
      try {
        await deleteLead(lead.id);
        toast.success("Lead deleted");
        router.push("/leads");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); }
    });
  };

  const phoneClean = lead.phone?.replace(/\s/g, "");

  return (
    <div className="space-y-6">
      <DetailHero
        backHref="/leads"
        title={lead.name}
        gradient={STATUS_GRADIENT[lead.status]}
        icon={<KireiAvatar name={lead.name} size={52} radius={14} />}
        status={lead.status}
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>{fmtSource(lead.source)}</span>
            {lead.suburb && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.suburb}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(lead.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </span>
        }
        actions={
          <>
            {phoneClean && (
              <a href={`tel:${phoneClean}`}>
                <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
                  <Phone className="w-4 h-4" /> Call
                </AnimatedPress>
              </a>
            )}
            {phoneClean && (
              <a href={`sms:${phoneClean}`}>
                <AnimatedPress className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium">
                  <MessageSquare className="w-4 h-4" /> SMS
                </AnimatedPress>
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}>
                <AnimatedPress className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium">
                  <Mail className="w-4 h-4" /> Email
                </AnimatedPress>
              </a>
            )}
          </>
        }
      />

      {/* Status changer */}
      <FadeIn delay={80}>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2.5">Pipeline stage</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const active = s === lead.status;
              return (
                <button
                  key={s}
                  disabled={pending || active}
                  onClick={() => setStatus(s)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all capitalize ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-card hover:bg-muted text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </FadeIn>

      {/* Details */}
      <FadeIn delay={140}>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2.5">Details</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {lead.service       && <FactCard gradient="primary" icon={<Wrench    className="w-4 h-4" />} label="Service"  value={lead.service} />}
            {lead.property_type && <FactCard gradient="blue"    icon={<MapPin    className="w-4 h-4" />} label="Property" value={lead.property_type} />}
            {lead.timing        && <FactCard gradient="amber"   icon={<Clock     className="w-4 h-4" />} label="Timing"   value={lead.timing} />}
            {lead.address       && <FactCard gradient="emerald" icon={<MapPin    className="w-4 h-4" />} label="Address"  value={lead.address} />}
            {lead.suburb        && <FactCard gradient="emerald" icon={<MapPin    className="w-4 h-4" />} label="Suburb"   value={lead.suburb} />}
            {lead.phone         && <FactCard gradient="primary" icon={<Phone     className="w-4 h-4" />} label="Phone"    value={lead.phone} />}
            {lead.email         && <FactCard gradient="violet"  icon={<Mail      className="w-4 h-4" />} label="Email"    value={lead.email} />}
            <FactCard gradient="dusk" icon={<User className="w-4 h-4" />} label="Source" value={fmtSource(lead.source)} />
            {(lead.utm_source || lead.utm_medium || lead.utm_campaign) && (
              <FactCard gradient="ocean" icon={<User className="w-4 h-4" />} label="Campaign" value={[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ")} />
            )}
          </div>
        </div>
      </FadeIn>

      {/* Notes */}
      {lead.notes && (
        <FadeIn delay={200}>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <GradientTile gradient="amber" size={28} radius={8}>
                <Clock className="w-3.5 h-3.5" />
              </GradientTile>
              <p className="text-sm font-semibold">Notes</p>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{lead.notes}</p>
          </div>
        </FadeIn>
      )}

      {/* Convert actions */}
      <FadeIn delay={260}>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2.5">Convert</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={convertCustomer} disabled={pending || !!lead.customer_id} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium disabled:opacity-50">
              <GradientTile gradient="blue" size={28} radius={8}><UserPlus className="w-3.5 h-3.5" /></GradientTile>
              {lead.customer_id ? "Customer linked" : "To customer"}
            </button>
            <button onClick={convertQuote} disabled={pending || !!lead.quote_id} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium disabled:opacity-50">
              <GradientTile gradient="violet" size={28} radius={8}><FileCheck className="w-3.5 h-3.5" /></GradientTile>
              {lead.quote_id ? "Quote drafted" : "To quote"}
            </button>
            <button onClick={convertWorkOrder} disabled={pending} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium disabled:opacity-50">
              <GradientTile gradient="amber" size={28} radius={8}><Wrench className="w-3.5 h-3.5" /></GradientTile>
              To work order
            </button>
          </div>
        </div>
      </FadeIn>

      {/* Danger zone */}
      <div className="pt-2">
        <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 className="w-4 h-4" /> Delete lead
        </button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {lead.name} will be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
