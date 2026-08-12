import { CustomerSurface } from "@/components/layout/customer-surface";

/**
 * A dead customer link — expired token, deleted form, renamed slug.
 *
 * It wraps itself in CustomerSurface rather than relying on the segment
 * layout: verified in dev, a `notFound()` boundary does NOT inherit the
 * segment's layout here, so without this the root theme (Midnight, dark)
 * catches it and someone whose link expired gets a dark navy page from a
 * vendor they've never heard of. Expired tokens are the normal end of a portal
 * link's life, not an edge case — real people see this page.
 */
export default function NotFound() {
  return (
    <CustomerSurface>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired, or been replaced by a newer one. Ask whoever
            sent it to share it again.
          </p>
        </div>
      </div>
    </CustomerSurface>
  );
}
