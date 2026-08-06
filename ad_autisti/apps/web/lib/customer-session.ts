import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  type CustomerAuthMeResponse,
  type CustomerAuthUser,
} from "@adam/types";

const DEFAULT_API_INTERNAL_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

export const getCustomerSessionUser = cache(async (): Promise<CustomerAuthUser | null> => {
  const cookieStore = await cookies();

  if (!cookieStore.has(CUSTOMER_SESSION_COOKIE_NAME)) {
    return null;
  }

  try {
    const response = await fetch(new URL("customer-auth/me", getApiBaseUrl()), {
      cache: "no-store",
      headers: {
        cookie: cookieStore.toString(),
      },
    });

    if (!response.ok) {
      return null;
    }

    const session = (await response.json()) as CustomerAuthMeResponse;
    return session.user;
  } catch {
    return null;
  }
});

export async function verifyCustomerSession(): Promise<CustomerAuthUser> {
  const user = await getCustomerSessionUser();

  if (!user) {
    redirect("/clienti/login");
  }

  return user;
}
