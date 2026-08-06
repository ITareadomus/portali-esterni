import { CustomerLoginForm } from "@/components/customer-login-form";
import { getRequestTheme } from "@/lib/theme-server";

export default async function ClientiLoginPage() {
  const theme = await getRequestTheme();

  return <CustomerLoginForm initialTheme={theme} />;
}
