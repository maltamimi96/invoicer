"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/customers/client-select";
import { createWorkOrder } from "@/lib/actions/work-orders";
import type { Customer, BusinessMember } from "@/types/database";

interface WorkOrderNewClientProps {
  customers: Customer[];
  members: BusinessMember[];
  ownerEmail: string;
  defaultCustomerId?: string;
}

export function WorkOrderNewClient({ customers, members, ownerEmail, defaultCustomerId }: WorkOrderNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  // All people who can be assigned: active members + owner
  const assignableOptions = [
    { email: ownerEmail, label: `${ownerEmail} (you)` },
    ...members.filter((m) => m.status === "active").map((m) => ({ email: m.email, label: `${m.email} · ${m.role}` })),
  ];

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    startTransition(async () => {
      try {
        const selected = assignableOptions.find((o) => o.email === assignedTo);
        const wo = await createWorkOrder({
          title: title.trim(),
          description: description.trim() || undefined,
          customer_id: customerId && customerId !== "none" ? customerId : null,
          property_address: propertyAddress.trim() || undefined,
          assigned_to: selected ? assignedTo : null,
          assigned_to_email: selected ? selected.email : null,
          scheduled_date: scheduledDate || null,
        });
        toast.success(`${wo.number} created`);
        router.push(`/work-orders/${wo.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create");
      }
    });
  };

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
            <Label>Instructions for worker</Label>
            <Textarea
              rows={4}
              placeholder="Describe what needs to be done or inspected. The worker will see this on-site."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Property Address</Label>
              <Input placeholder="102 Smith St, Sydney NSW" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <ClientSelect
                customers={customers}
                value={customerId}
                onValueChange={setCustomerId}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignableOptions.map((o) => (
                    <SelectItem key={o.email} value={o.email}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
