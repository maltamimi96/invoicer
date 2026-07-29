"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Material } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sku: z.string().optional(),
  supplier: z.string().optional(),
  cost_price: z.coerce.number().min(0, "Cost must be positive"),
  sell_price: z.coerce.number().min(0, "Sell price must be positive"),
  tax_rate: z.coerce.number().min(0).max(100),
  unit: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface MaterialFormProps {
  material?: Material;
  onSubmit: (data: FormData & { archived: boolean }) => Promise<void>;
  onCancel?: () => void;
}

export function MaterialForm({ material, onSubmit, onCancel }: MaterialFormProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: material ? {
      name: material.name,
      description: material.description ?? "",
      sku: material.sku ?? "",
      supplier: material.supplier ?? "",
      cost_price: material.cost_price,
      sell_price: material.sell_price,
      tax_rate: material.tax_rate,
      unit: material.unit ?? "",
    } : { tax_rate: 20 },
  });

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit({ ...data, archived: material?.archived ?? false });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input placeholder="e.g. 90mm PVC pipe" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea placeholder="Brief description..." rows={2} {...register("description")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Base cost</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register("cost_price")} />
          <p className="text-[11px] text-muted-foreground">What you pay</p>
          {errors.cost_price && <p className="text-xs text-destructive">{errors.cost_price.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Sell price</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register("sell_price")} />
          <p className="text-[11px] text-muted-foreground">What you charge on a quote</p>
          {errors.sell_price && <p className="text-xs text-destructive">{errors.sell_price.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tax rate (%)</Label>
        <Input type="number" step="0.01" placeholder="20" {...register("tax_rate")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>SKU / code</Label>
          <Input placeholder="Optional" {...register("sku")} />
        </div>
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Input placeholder="Optional" {...register("supplier")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Unit</Label>
        <Input placeholder="e.g. each, m, kg, box" {...register("unit")} />
      </div>
      <div className="flex gap-3 pt-2">
        {onCancel && <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {material ? "Save changes" : "Add material"}
        </Button>
      </div>
    </form>
  );
}
