import { DriverRoutePanel } from "@/components/driver-route-panel";
import { verifyDriverSession } from "@/lib/driver-session";
import { getRequestTheme } from "@/lib/theme-server";

export default async function AutistiGiroPage() {
  const user = await verifyDriverSession();
  const theme = await getRequestTheme();

  return <DriverRoutePanel initialTheme={theme} user={user} />;
}
