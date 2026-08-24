import type {
  CustomerCalendarActivitiesRequest,
  CustomerCalendarActivitiesResponse,
  CustomerTodayActivitiesRequest,
  CustomerAuthLogoutResponse,
  CustomerAuthMeResponse,
  CustomerTodayActivitiesResponse,
  DriverAuthLogoutResponse,
  DriverAuthMeResponse,
  DriverStopStatusResponse,
  DriverTodayRouteRequest,
  DriverTodayRouteResponse,
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

export async function getDriverMe(signal?: AbortSignal): Promise<DriverAuthMeResponse> {
  const response = await fetch(`${API_BASE}/driver-auth/me`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_me_${response.status}`);
  }

  return (await response.json()) as DriverAuthMeResponse;
}

export async function logoutDriver(signal?: AbortSignal): Promise<DriverAuthLogoutResponse> {
  const response = await fetch(`${API_BASE}/driver-auth/logout`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_logout_${response.status}`);
  }

  return (await response.json()) as DriverAuthLogoutResponse;
}

export async function getDriverTodayRoute(
  signal?: AbortSignal,
  request: DriverTodayRouteRequest = {},
): Promise<DriverTodayRouteResponse> {
  const query = queryString({
    date: request.date,
  });
  const response = await fetch(`${API_BASE}/driver/timeline/today${query ? `?${query}` : ""}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_timeline_today_${response.status}`);
  }

  return (await response.json()) as DriverTodayRouteResponse;
}

export async function startDriverStop(
  timelineId: number,
  signal?: AbortSignal,
): Promise<DriverStopStatusResponse> {
  const response = await fetch(`${API_BASE}/driver/timeline/${timelineId}/start`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_timeline_start_${response.status}`);
  }

  return (await response.json()) as DriverStopStatusResponse;
}

export async function pauseDriverStop(
  timelineId: number,
  signal?: AbortSignal,
): Promise<DriverStopStatusResponse> {
  const response = await fetch(`${API_BASE}/driver/timeline/${timelineId}/pause`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_timeline_pause_${response.status}`);
  }

  return (await response.json()) as DriverStopStatusResponse;
}

export async function finishDriverStop(
  timelineId: number,
  signal?: AbortSignal,
): Promise<DriverStopStatusResponse> {
  const response = await fetch(`${API_BASE}/driver/timeline/${timelineId}/finish`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_timeline_finish_${response.status}`);
  }

  return (await response.json()) as DriverStopStatusResponse;
}

export async function reopenDriverStop(
  timelineId: number,
  signal?: AbortSignal,
): Promise<DriverStopStatusResponse> {
  const response = await fetch(`${API_BASE}/driver/timeline/${timelineId}/reopen`, {
    cache: "no-store",
    credentials: "include",
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(`driver_timeline_reopen_${response.status}`);
  }

  return (await response.json()) as DriverStopStatusResponse;
}
