/**
 * The dashboard's 404.
 *
 * Reached when a page calls notFound() — a record that was deleted, a link from
 * an old email, an id that never existed. Without this, Next's global 404
 * renders outside the shell: no sidebar, no business switcher, and a signed-in
 * user is dropped onto a page that looks like they've been logged out.
 *
 * "Not found" is not an error, so it doesn't get the alarming treatment — just
 * says the thing isn't there and points back at something that is.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/kirei";
import { Search } from "@/components/ui/icons";

export default function DashboardNotFound() {
  return (
    <div className="py-6">
      <EmptyState
        icon={<Search className="h-6 w-6 text-white" />}
        gradient="primary"
        title="We couldn't find that"
        hint="It may have been deleted, or the link might be out of date."
      />
      <div className="mt-5 flex justify-center">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
