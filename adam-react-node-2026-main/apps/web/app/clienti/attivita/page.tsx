import { CustomerActivitiesPanel } from "@/components/customer-activities-panel";
import { verifyCustomerSession } from "@/lib/customer-session";
import { getRequestTheme } from "@/lib/theme-server";

export default async function ClientiAttivitaPage() {
  const user = await verifyCustomerSession();
  const theme = await getRequestTheme();

  return <CustomerActivitiesPanel activeService="today" initialTheme={theme} user={user} />;
}
