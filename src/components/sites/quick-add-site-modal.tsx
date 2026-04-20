"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MapPin } from "@/components/ui/icons";
import { createSite } from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Site } from "@/types/database";

const schema = z.object({
  label: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface QuickAddSiteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onCreated: (site: Site) => void;
}

export function QuickAddSiteModal({ open, onOpenChange, accountId, onCreated }: QuickAddSiteModalProps) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const site = await createSite(accountId, {
        label: data.label || null,
        address: data.address,
        city: data.city || null,
        postcode: data.postcode || null,
        country: data.country || null,
      });
      toast.success("Property added");
      reset();
      onCreated(site);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Add new property
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Label (optional)</Label>
              <Input placeholder="Head Office, Warehouse 2…" {...register("label")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address *</Label>
              <Input placeholder="102 Smith St" autoFocus {...register("address")} />
              {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input placeholder="Sydney" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input placeholder="2000" {...register("postcode")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Country</Label>
              <Input placeholder="Australia" {...register("country")} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save property
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
