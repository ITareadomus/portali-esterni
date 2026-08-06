import { CustomerActivitiesPanel } from "@/components/customer-activities-panel";
import { verifyCustomerSession } from "@/lib/customer-session";
import { getRequestTheme } from "@/lib/theme-server";

export default async function ClientiCalendarioPage() {
  const user = await verifyCustomerSession();
  const theme = await getRequestTheme();

  return <CustomerActivitiesPanel activeService="calendar" initialTheme={theme} user={user} />;
}
