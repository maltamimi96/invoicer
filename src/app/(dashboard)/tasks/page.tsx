import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listTasks } from "@/lib/actions/tasks";
import { KanbanBoard } from "@/components/tasks/kanban-board";

export const dynamic = "force-dynamic";

type MemberInput = {
  user_id: string | null;
  email: string;
  status: string;
};

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const businessId = await getActiveBizId(sb, user.id);

  const [tasks, rawMembersRes, ownerBizRes, workOrdersRes, customersRes, contactsRes] = await Promise.all([
    listTasks(),
    sb.from("business_members").select("user_id, email, status").eq("business_id", businessId).eq("status", "active"),
    sb.from("businesses").select("user_id, email").eq("id", businessId).single(),
    sb.from("work_orders").select("id, title, customer_id").eq("business_id", businessId).order("created_at", { ascending: false }).limit(100),
    sb.from("customers").select("id, name, company").eq("business_id", businessId).eq("archived", false).order("name").limit(200),
    sb.from("contacts").select("id, name, company").eq("business_id", businessId).eq("archived", false).order("name").limit(200),
  ]);

  const ownerBiz = ownerBizRes.data as { user_id: string; email: string } | null;
  const rawMembers = rawMembersRes.data as MemberInput[] | null;

  const members: { user_id: string; email: string; name: string | null }[] = [];
  if (ownerBiz?.user_id) {
    members.push({ user_id: ownerBiz.user_id, email: ownerBiz.email ?? "owner", name: "Owner" });
  }
  for (const m of rawMembers ?? []) {
    if (!m.user_id || m.user_id === ownerBiz?.user_id) continue;
    members.push({ user_id: m.user_id, email: m.email, name: null });
  }

  const workOrders = (workOrdersRes.data ?? []) as { id: string; title: string | null }[];
  const customers = (customersRes.data ?? []) as { id: string; name: string; company: string | null }[];
  const contacts = (contactsRes.data ?? []) as { id: string; name: string; company: string | null }[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Drag cards between columns. Click a card to assign, tag, or link it to a job.
        </p>
      </div>
      <KanbanBoard
        initialTasks={tasks}
        members={members}
        workOrders={workOrders}
        customers={customers}
        contacts={contacts}
      />
    </div>
  );
}
