import { DriverLoginForm } from "@/components/driver-login-form";
import { getRequestTheme } from "@/lib/theme-server";

export default async function AutistiLoginPage() {
  const theme = await getRequestTheme();

  return <DriverLoginForm initialTheme={theme} />;
}
