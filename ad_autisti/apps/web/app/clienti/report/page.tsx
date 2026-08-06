import { CustomerActivitiesPanel } from "@/components/customer-activities-panel";
import { verifyCustomerSession } from "@/lib/customer-session";
import { getRequestTheme } from "@/lib/theme-server";

export default async function ClientiReportPage() {
  const user = await verifyCustomerSession();
  const theme = await getRequestTheme();

  return <CustomerActivitiesPanel activeService="report" initialTheme={theme} user={user} />;
}
