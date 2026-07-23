import "server-only";

import { cookies } from "next/headers";
import { resolveThemeName, THEME_COOKIE_NAME, type ThemeName } from "@/lib/theme";

export async function getRequestTheme(): Promise<ThemeName> {
  const cookieStore = await cookies();
  return resolveThemeName(cookieStore.get(THEME_COOKIE_NAME)?.value);
}
