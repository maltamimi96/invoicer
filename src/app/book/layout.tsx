import { CustomerSurface } from "@/components/layout/customer-surface";

/** Customer-facing: pinned light, never the operator's dashboard theme. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerSurface>{children}</CustomerSurface>;
}
