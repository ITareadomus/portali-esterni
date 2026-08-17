"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type DriverLoginActionState = {
  code: string;
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

const initialDriverLoginState: DriverLoginActionState = {
  code: "",
  message: null,
  remember: false,
};

const DEFAULT_API_INTERNAL_URL = "http://localhost:3001";
const INVALID_USER_MESSAGE = "Lo user non è corretto.";

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

function failedState(code: string, remember: boolean, message: string): DriverLoginActionState {
  return {
    code,
    message,
    remember,
  };
}

export async function loginDriverAction(
  _state: DriverLoginActionState,
  formData: FormData,
): Promise<DriverLoginActionState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  let authenticated = false;

  if (!code || !password) {
    return failedState(code, remember, "Controlla i dati inseriti.");
  }

  try {
    const response = await fetch(new URL("driver-auth/login", getApiBaseUrl()), {
      body: JSON.stringify({
        code,
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
      const payload = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const rawMessage = Array.isArray(payload?.message) ? payload?.message[0] : payload?.message;
      const message =
        typeof rawMessage === "string" && rawMessage.trim() ? rawMessage.trim() : INVALID_USER_MESSAGE;
      return failedState(code, remember, message);
    }

    if (response.status === 400) {
      return failedState(code, remember, "Controlla i dati inseriti.");
    }

    if (!response.ok) {
      return failedState(code, remember, "Accesso non riuscito. Riprova.");
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
      return failedState(code, remember, "Accesso non riuscito. Riprova.");
    }

    authenticated = true;
  } catch {
    return failedState(code, remember, "Accesso non riuscito. Riprova.");
  }

  if (authenticated) {
    redirect("/autisti/giro");
  }

  return initialDriverLoginState;
}
