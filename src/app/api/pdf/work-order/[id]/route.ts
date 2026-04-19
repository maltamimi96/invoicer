import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  try {
    // Authorize: either authenticated owner of the work order, OR valid share token.
    let authorized = false;
    let businessId: string | null = null;

    if (token) {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (admin as any)
        .from("work_orders").select("id, business_id, share_token").eq("id", id).maybeSingle();
      if (data?.share_token && data.share_token === token) {
        authorized = true;
        businessId = data.business_id;
      }
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("work_orders").select("id, business_id").eq("id", id).maybeSingle();
        if (data) { authorized = true; businessId = data.business_id; }
      }
    }

    if (!authorized || !businessId) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const sb = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: workOrder } = await (sb as any)
      .from("work_orders").select("*, customers(name, company)").eq("id", id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: business } = await (sb as any)
      .from("businesses").select("*").eq("id", businessId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sitePromise = workOrder.site_id ? (sb as any)
      .from("sites").select("label, address, city, postcode").eq("id", workOrder.site_id).maybeSingle() : Promise.resolve({ data: null });
    const [siteRes, photosRes, timelineRes, sigsRes, docsRes] = await Promise.all([
      sitePromise,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("job_photos").select("*").eq("work_order_id", id).order("captured_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("job_timeline_events").select("*").eq("work_order_id", id).order("created_at", { ascending: false }).limit(50),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("job_signatures").select("*").eq("work_order_id", id).order("signed_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("job_documents").select("*").eq("work_order_id", id).order("uploaded_at", { ascending: false }),
    ]);

    const site = siteRes.data;
    const siteLine = site ? [site.label, site.address, site.city, site.postcode].filter(Boolean).join(", ") : null;
    const customerName = workOrder.customers?.name ?? null;

    // For shared (token) requests, restrict to customer-visible items only.
    const filterShared = !!token;
    const photos = filterShared ? (photosRes.data ?? []).filter((p: { customer_visible: boolean }) => p.customer_visible) : (photosRes.data ?? []);
    const timeline = filterShared ? (timelineRes.data ?? []).filter((e: { visible_to_customer: boolean }) => e.visible_to_customer) : (timelineRes.data ?? []);
    const documents = filterShared ? (docsRes.data ?? []).filter((d: { customer_visible: boolean }) => d.customer_visible) : (docsRes.data ?? []);
    const signatures = sigsRes.data ?? [];

    const { renderToStream } = await import("@react-pdf/renderer");
    const { WorkOrderPDFDocument } = await import("@/components/work-orders/work-order-pdf-document");
    const React = await import("react");

    const element = React.createElement(WorkOrderPDFDocument, {
      workOrder, business, customerName, siteLine, photos, timeline, signatures, documents,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${workOrder.number}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF/WorkOrder]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
