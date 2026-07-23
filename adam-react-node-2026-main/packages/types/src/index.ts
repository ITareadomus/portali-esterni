export type HealthResponse = {
  status: "ok";
};

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthLoginResponse = {
  ok: true;
  user: AuthUser;
};

export type AuthMeResponse = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type AuthLogoutResponse = {
  ok: true;
};

export type CustomerAuthUser = {
  id: number;
  email: string;
  name: string | null;
  nameFrontend: string | null;
  tenantId: number;
};

export const CUSTOMER_SESSION_COOKIE_NAME = "adam_customer_session";

export type CustomerAuthLoginRequest = {
  email: string;
  password: string;
  remember?: boolean;
};

export type CustomerAuthLoginResponse = {
  ok: true;
  user: CustomerAuthUser;
};

export type CustomerAuthMeResponse = {
  authenticated: true;
  user: CustomerAuthUser;
};

export type CustomerAuthLogoutResponse = {
  ok: true;
};

export type CustomerActivityOrderBy =
  | "id"
  | "checkout"
  | "checkoutTime"
  | "checkin"
  | "checkinTime"
  | "cleaned"
  | "closed"
  | "sequence"
  | "todayStatusNameFrontend"
  | "updatedAt";

export type CustomerActivityOrderDirection = "asc" | "desc";

export type CustomerTodayActivitiesRequest = {
  includeNoShow?: boolean;
  languageId: number;
  orderBy: CustomerActivityOrderBy;
  orderDirection: CustomerActivityOrderDirection;
};

export type CustomerCalendarActivitiesRequest = {
  includeNoShow?: boolean;
  languageId: number;
  startDate: string;
  endDate: string;
  orderBy: CustomerActivityOrderBy;
  orderDirection: CustomerActivityOrderDirection;
};

export type CustomerTodayActivity = {
  id: number;
  referenceId: string | null;
  structureId: number;
  operationId: number | null;
  activityId: number | null;
  checkout: string | null;
  checkoutTime: string | null;
  checkoutPax: number;
  checkin: string | null;
  checkinTime: string | null;
  checkinPax: number;
  noShow: number;
  deletedAtClient: string | null;
  cleanedByUs: number | null;
  startwork: number | null;
  startworkAt: string | null;
  startreport: number | null;
  startreportAt: string | null;
  cleaned: number | null;
  closed: number | null;
  deleted: number | null;
  sequence: number | null;
  updatedAt: string | null;
  deletedAt: string | null;
  taskStatus: number;
  structure: {
    id: number;
    customerId: number;
    aptCode: string;
    logisticCode: number | null;
    name: string;
    nameFrontend: string | null;
    address1: string | null;
    city: string | null;
    postcode: string | null;
    alertKeys: number | null;
    structureKeys: string | null;
    customer: {
      id: number;
      name: string | null;
      nameFrontend: string | null;
      color: string | null;
    };
    state: {
      isoCode: string | null;
    } | null;
  };
  operation: {
    id: number | null;
    name: string | null;
  };
  activity: {
    id: number | null;
    name: string | null;
  };
  assignedUser: {
    id: number;
    name: string | null;
    lastname: string | null;
  } | null;
};

export type CustomerTodayActivitiesResponse = {
  date: {
    ymd: string;
  };
  activities: CustomerTodayActivity[];
};

export type CustomerCalendarActivitiesResponse = {
  range: {
    startDate: string;
    endDate: string;
  };
  activities: CustomerTodayActivity[];
};

export type PlatformContextResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    role: "admin";
  };
  platform: {
    role: "admin";
    tenantBound: false;
  };
};
