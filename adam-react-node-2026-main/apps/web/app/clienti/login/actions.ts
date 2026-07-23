"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type CustomerLoginActionState = {
  email: string;
  message: string | null;
  remember: boolean;
};

type CookieOptions = {
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
};

const initialCustomerLoginState: CustomerLoginActionState = {
  email: "",
  message: null,
  remember: false,
};

const DEFAULT_API_INTERNAL_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders = headers.getSetCookie?.();
  if (setCookieHeaders && setCookieHeaders.length > 0) {
    return setCookieHeaders;
  }

  const setCookie = response.headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function parseSetCookieHeader(header: string): { name: string; options: CookieOptions; value: string } | null {
  const [nameValue, ...attributes] = header.split(";").map((part) => part.trim());
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const name = nameValue.slice(0, separatorIndex);
  const value = nameValue.slice(separatorIndex + 1);
  const options: CookieOptions = {};

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const rawValue = rawValueParts.join("=").trim();

    if (key === "httponly") {
      options.httpOnly = true;
      continue;
    }

    if (key === "secure") {
      options.secure = true;
      continue;
    }

    if (key === "path" && rawValue) {
      options.path = rawValue;
      continue;
    }

    if (key === "max-age") {
      const maxAge = Number(rawValue);
      if (Number.isInteger(maxAge) && maxAge >= 0) {
        options.maxAge = maxAge;
      }
      continue;
    }

    if (key === "expires" && rawValue) {
      const expires = new Date(rawValue);
      if (!Number.isNaN(expires.getTime())) {
        options.expires = expires;
      }
      continue;
    }

    if (key === "samesite") {
      const sameSite = rawValue.toLowerCase();
      if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
        options.sameSite = sameSite;
      }
    }
  }

  return {
    name,
    options,
    value,
  };
}

function failedState(email: string, remember: boolean, message: string): CustomerLoginActionState {
  return {
    email,
    message,
    remember,
  };
}

export async function loginCustomerAction(
  _state: CustomerLoginActionState,
  formData: FormData,
): Promise<CustomerLoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  let authenticated = false;

  if (!email || !password) {
    return failedState(email, remember, "Controlla i dati inseriti.");
  }

  try {
    const response = await fetch(new URL("customer-auth/login", getApiBaseUrl()), {
      body: JSON.stringify({
        email,
        password,
        remember,
      }),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "manual",
    });

    if (response.status === 401) {
      return failedState(email, remember, "Email o password non validi.");
    }

    if (response.status === 400) {
      return failedState(email, remember, "Controlla i dati inseriti.");
    }

    if (!response.ok) {
      return failedState(email, remember, "Accesso non riuscito. Riprova.");
    }

    const cookieStore = await cookies();
    const setCookieHeaders = getSetCookieHeaders(response);
    for (const setCookieHeader of setCookieHeaders) {
      const parsedCookie = parseSetCookieHeader(setCookieHeader);
      if (parsedCookie) {
        cookieStore.set(parsedCookie.name, parsedCookie.value, parsedCookie.options);
      }
    }

    if (setCookieHeaders.length === 0) {
      return failedState(email, remember, "Accesso non riuscito. Riprova.");
    }

    authenticated = true;
  } catch {
    return failedState(email, remember, "Accesso non riuscito. Riprova.");
  }

  if (authenticated) {
    redirect("/clienti/attivita");
  }

  return initialCustomerLoginState;
}
