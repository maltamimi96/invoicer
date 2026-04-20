"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  unit_price: z.coerce.number().min(0, "Price must be positive"),
  tax_rate: z.coerce.number().min(0).max(100),
  unit: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ProductFormProps {
  product?: Product;
  onSubmit: (data: FormData & { archived: boolean }) => Promise<void>;
  onCancel?: () => void;
}

export function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: product ? {
      name: product.name,
      description: product.description ?? "",
      unit_price: product.unit_price,
      tax_rate: product.tax_rate,
      unit: product.unit ?? "",
    } : { tax_rate: 20 },
  });

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit({ ...data, archived: product?.archived ?? false });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input placeholder="e.g. Web Design" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea placeholder="Brief description..." rows={2} {...register("description")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Unit price (£)</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register("unit_price")} />
          {errors.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Tax rate (%)</Label>
          <Input type="number" step="0.01" placeholder="20" {...register("tax_rate")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Unit</Label>
        <Input placeholder="e.g. hour, day, item" {...register("unit")} />
      </div>
      <div className="flex gap-3 pt-2">
        {onCancel && <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {product ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
