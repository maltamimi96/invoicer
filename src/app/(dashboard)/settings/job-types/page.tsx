import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listJobTypes } from "@/lib/actions/job-types";
import { JobTypesClient } from "@/components/settings/job-types-client";

export default async function JobTypesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const jobTypes = await listJobTypes({ includeInactive: true });
  return <JobTypesClient initial={jobTypes} />;
}
