import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: Request, { params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // RLS on pay_run_lines gates this to the user's business (non-worker members).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: line } = await (supabase as any).from("pay_run_lines").select("*").eq("id", lineId).maybeSingle();
    if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sb = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: run } = await (sb as any).from("pay_runs").select("*").eq("id", line.pay_run_id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: business } = await (sb as any).from("businesses").select("name").eq("id", line.business_id).single();

    const { renderToStream } = await import("@react-pdf/renderer");
    const { PayslipDocument } = await import("@/components/payroll/payslip-document");
    const element = PayslipDocument({ line, run, businessName: business?.name ?? "Payslip" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of stream as any) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="payslip-${line.name.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
