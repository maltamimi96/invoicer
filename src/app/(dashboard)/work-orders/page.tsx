import { getWorkOrders } from "@/lib/actions/work-orders";
import { getMembers } from "@/lib/actions/members";
import { getMyRole } from "@/lib/actions/my-role";
import { WorkOrdersClient } from "@/components/work-orders/work-orders-client";

export default async function WorkOrdersPage() {
  const [workOrders, members, userRole] = await Promise.all([
    getWorkOrders(),
    getMembers(),
    getMyRole(),
  ]);
  return <WorkOrdersClient workOrders={workOrders} members={members} userRole={userRole} />;
}
