import { getMaterials } from "@/lib/actions/materials";
import { getBusiness } from "@/lib/actions/business";
import { MaterialsClient } from "@/components/materials/materials-client";

export default async function MaterialsPage() {
  const [materials, business] = await Promise.all([getMaterials(), getBusiness()]);
  return <MaterialsClient materials={materials} currency={business.currency} />;
}
