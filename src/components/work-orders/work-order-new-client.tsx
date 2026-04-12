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
import type { Customer, MemberProfile } from "@/types/database";

interface WorkOrderNewClientProps {
  customers: Customer[];
  profiles: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];
  defaultCustomerId?: string;
}

export function WorkOrderNewClient({ customers, profiles, defaultCustomerId }: WorkOrderNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [assignedProfileId, setAssignedProfileId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    startTransition(async () => {
      try {
        const selectedProfile = profiles.find((p) => p.id === assignedProfileId);
        const wo = await createWorkOrder({
          title: title.trim(),
          description: description.trim() || undefined,
          customer_id: customerId && customerId !== "none" ? customerId : null,
          property_address: propertyAddress.trim() || undefined,
          assigned_to: selectedProfile ? selectedProfile.name : null,
          assigned_to_email: selectedProfile ? selectedProfile.email : null,
          assigned_to_profile_id: selectedProfile ? selectedProfile.id : null,
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
              <Select value={assignedProfileId} onValueChange={setAssignedProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.role_title ? ` · ${p.role_title}` : ""}
                    </SelectItem>
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
