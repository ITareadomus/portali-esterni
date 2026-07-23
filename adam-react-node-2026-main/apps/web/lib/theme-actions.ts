"use server";

import { cookies } from "next/headers";
import { isThemeName, THEME_COOKIE_MAX_AGE_SECONDS, THEME_COOKIE_NAME } from "@/lib/theme";

export async function setThemeAction(theme: string): Promise<void> {
  if (!isThemeName(theme)) {
    throw new Error("Invalid theme.");
  }

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_NAME, theme, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
