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
  business_members_profile?: { display_name?: string | null } | null;
};

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const tasks = await listTasks();

  // Active members on the business — owner is implicit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawMembers } = await (supabase as any)
    .from("business_members")
    .select("user_id, email, status")
    .eq("business_id", businessId)
    .eq("status", "active");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ownerBiz } = await (supabase as any)
    .from("businesses")
    .select("user_id, email")
    .eq("id", businessId)
    .single();

  const members: { user_id: string; email: string; name: string | null }[] = [];
  if (ownerBiz?.user_id) {
    members.push({
      user_id: ownerBiz.user_id,
      email: ownerBiz.email ?? "owner",
      name: "Owner",
    });
  }
  for (const m of (rawMembers as MemberInput[]) ?? []) {
    if (!m.user_id || m.user_id === ownerBiz?.user_id) continue;
    members.push({ user_id: m.user_id, email: m.email, name: null });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Drag cards between columns. Click a card to assign or edit.
        </p>
      </div>
      <KanbanBoard initialTasks={tasks} members={members} />
    </div>
  );
}
