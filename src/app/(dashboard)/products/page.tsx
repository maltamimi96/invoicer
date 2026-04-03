import { getProducts } from "@/lib/actions/products";
import { getBusiness } from "@/lib/actions/business";
import { ProductsClient } from "@/components/products/products-client";

export default async function ProductsPage() {
  const [products, business] = await Promise.all([getProducts(), getBusiness()]);
  return <ProductsClient products={products} currency={business.currency} />;
}
