import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DRIVER_SESSION_COOKIE_NAME,
  type DriverAuthMeResponse,
  type DriverAuthUser,
} from "@adam/types";

const DEFAULT_API_INTERNAL_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

export const getDriverSessionUser = cache(async (): Promise<DriverAuthUser | null> => {
  const cookieStore = await cookies();

  if (!cookieStore.has(DRIVER_SESSION_COOKIE_NAME)) {
    return null;
  }

  try {
    const response = await fetch(new URL("driver-auth/me", getApiBaseUrl()), {
      cache: "no-store",
      headers: {
        cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return null;
    }

    const session = (await response.json()) as DriverAuthMeResponse;
    return session.user;
  } catch {
    return null;
  }
});

export async function verifyDriverSession(): Promise<DriverAuthUser> {
  const user = await getDriverSessionUser();

  if (!user) {
    redirect("/autisti/login");
  }

  return user;
}
