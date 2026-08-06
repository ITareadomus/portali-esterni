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

export const DRIVER_SESSION_COOKIE_NAME = "adam_driver_session";

export type DriverAuthUser = {
  id: number;
  name: string | null;
  lastname: string | null;
};

export type DriverAuthLoginRequest = {
  email: string;
  password: string;
  remember?: boolean;
};

export type DriverAuthLoginResponse = {
  ok: true;
  user: DriverAuthUser;
};

export type DriverAuthMeResponse = {
  authenticated: true;
  user: DriverAuthUser;
};

export type DriverAuthLogoutResponse = {
  ok: true;
};

export type DriverAccessKey = {
  name: string;
  type: string | null;
};

export type DriverAccessBundle = {
  id: number | null;
  number: string | null;
  label: string | null;
  type: string | null;
  keys: DriverAccessKey[];
};

export type DriverTimelineStop = {
  id: number;
  sequence: number | null;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  customerName: string | null;
  logisticCode: number | null;
  logisticsTaskKind: string | null;
  straordinaria: boolean;
  premium: boolean;
  customerNote: string | null;
  cleanerAlias: string | null;
  cleanerSequence: number | null;
  cleanerMobile: string | null;
  cleanerStartTime: string | null;
  cleanerEndTime: string | null;
  singleSofabeds: number | null;
  doubleSofabeds: number | null;
  accessBundles: DriverAccessBundle[];
  lat: number | null;
  lng: number | null;
  travelTime: number | null;
  checkinDate: string | null;
  checkoutDate: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
  taskId: number | null;
  isStarted: boolean;
  isPaused: boolean;
  isFinished: boolean;
  realStart: string | null;
  realEnd: string | null;
};

export type DriverTodayRouteRequest = {
  date?: string;
};

export type DriverFinishStopRequest = {
  timelineId: number;
};

export type DriverStopStatusResponse = {
  ok: true;
  timelineId: number;
  taskId: number;
  isStarted: boolean;
  isPaused: boolean;
  isFinished: boolean;
  realStart: string | null;
  realEnd: string | null;
};

/** @deprecated Use DriverStopStatusResponse */
export type DriverFinishStopResponse = DriverStopStatusResponse;

export type DriverTodayRouteResponse = {
  date: {
    ymd: string;
  };
  driver: {
    id: number;
    name: string | null;
    lastname: string | null;
    startTime: string | null;
    endTime: string | null;
    available: boolean | null;
    selected: boolean;
    vehicle: {
      id: number | null;
      name: string | null;
      pmsCode: string | null;
      taskId: number | null;
    } | null;
  };
  stops: DriverTimelineStop[];
};
