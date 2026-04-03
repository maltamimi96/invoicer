import { getWorkOrders } from "@/lib/actions/work-orders";
import { getMembers } from "@/lib/actions/members";
import { WorkOrdersClient } from "@/components/work-orders/work-orders-client";

export default async function WorkOrdersPage() {
  const [workOrders, members] = await Promise.all([
    getWorkOrders(),
    getMembers(),
  ]);
  return <WorkOrdersClient workOrders={workOrders} members={members} />;
}
