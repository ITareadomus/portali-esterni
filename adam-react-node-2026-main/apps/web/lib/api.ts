import type {
  CustomerCalendarActivitiesRequest,
  CustomerCalendarActivitiesResponse,
  CustomerTodayActivitiesRequest,
  CustomerAuthLogoutResponse,
  CustomerAuthMeResponse,
  CustomerTodayActivitiesResponse,
  HealthResponse,
  PlatformContextResponse,
} from "@adam/types";

const API_BASE = "/api";

function queryString(params: Record<string, boolean | number | string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search.toString();
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`health_${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}

export async function getPlatformContext(signal?: AbortSignal): Promise<PlatformContextResponse> {
  const response = await fetch(`${API_BASE}/platform-context`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`platform_context_${response.status}`);
  }

  return (await response.json()) as PlatformContextResponse;
}

export async function getCustomerMe(signal?: AbortSignal): Promise<CustomerAuthMeResponse> {
  const response = await fetch(`${API_BASE}/customer-auth/me`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`customer_me_${response.status}`);
  }

  return (await response.json()) as CustomerAuthMeResponse;
}

export async function logoutCustomer(signal?: AbortSignal): Promise<CustomerAuthLogoutResponse> {
  const response = await fetch(`${API_BASE}/customer-auth/logout`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`customer_logout_${response.status}`);
  }

  return (await response.json()) as CustomerAuthLogoutResponse;
}

export async function getCustomerTodayActivities(
  signal?: AbortSignal,
  request: CustomerTodayActivitiesRequest = {
    includeNoShow: false,
    languageId: 1,
    orderBy: "todayStatusNameFrontend",
    orderDirection: "asc",
  },
): Promise<CustomerTodayActivitiesResponse> {
  const response = await fetch(`${API_BASE}/customer/activities/today?${queryString(request)}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`customer_activities_today_${response.status}`);
  }

  return (await response.json()) as CustomerTodayActivitiesResponse;
}

export async function getCustomerCalendarActivities(
  signal: AbortSignal | undefined,
  request: CustomerCalendarActivitiesRequest,
): Promise<CustomerCalendarActivitiesResponse> {
  const response = await fetch(`${API_BASE}/customer/activities/calendar?${queryString(request)}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`customer_activities_calendar_${response.status}`);
  }

  return (await response.json()) as CustomerCalendarActivitiesResponse;
}
