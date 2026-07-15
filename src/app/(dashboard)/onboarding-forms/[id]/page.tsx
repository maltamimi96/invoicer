import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getOnboardingForm, getSecureFieldsAvailable, getOnboardingResponse, getOnboardingRequests } from "@/lib/actions/onboarding";
import { FormBuilderClient } from "@/components/onboarding/form-builder-client";
import { ResponseViewerClient } from "@/components/onboarding/response-viewer-client";

export default async function OnboardingFormBuilderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ response?: string; view?: string }>;
}) {
  const { id } = await params;
  const { response: responseRequestId, view } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  let form;
  try { form = await getOnboardingForm(id); } catch { notFound(); }
  if (!form) notFound();

  // ?response=<requestId> → show the submitted answers instead of the builder.
  if (responseRequestId) {
    const [response, requests] = await Promise.all([
      getOnboardingResponse(responseRequestId),
      getOnboardingRequests({ form_id: id }),
    ]);
    const request = requests.find((r) => r.id === responseRequestId);
    if (response && request) {
      return (
        <ResponseViewerClient
          formId={id}
          formName={form.name}
          response={response}
          customerName={request.customers?.name ?? "Customer"}
          customerId={request.customer_id}
        />
      );
    }
    // No response yet — fall through to the builder.
  }

  const secureAvailable = await getSecureFieldsAvailable();
  return <FormBuilderClient form={form} secureAvailable={secureAvailable} startInPreview={view === "1"} />;
}
