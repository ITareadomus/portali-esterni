import { Inject, Injectable } from "@nestjs/common";
import type {
  CustomerActivityOrderBy,
  CustomerActivityOrderDirection,
  CustomerCalendarActivitiesResponse,
  CustomerTodayActivitiesResponse,
  CustomerTodayActivity,
} from "@adam/types";
import type { CustomerAuthSession } from "../customer-auth/customer-auth.service";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_LANGUAGE_ID = 1;
const ROME_TIME_ZONE = "Europe/Rome";
const STRUCTURE_KINDS_SETTING_KEY = "STRUCTURE_KINDS";
const TODAY_STATUS_NAME_FRONTEND_ORDER = "todayStatusNameFrontend";

type ActivityQueryRow = {
  id: number;
  referenceId: string | null;
  structureId: number;
  operationId: number | null;
  activityId: number | null;
  checkout: Date | null;
  checkoutTime: string | null;
  checkoutPax: number;
  checkin: Date | null;
  checkinTime: string | null;
  checkinPax: number;
  noShow: number;
  deletedAtClient: Date | null;
  cleanedByUs: number | null;
  startwork: number | null;
  startworkAt: Date | null;
  startreport: number | null;
  startreportAt: Date | null;
  cleaned: number | null;
  closed: number | null;
  deleted: number | null;
  sequence: number | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
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
    langs: Array<{
      name: string;
    }>;
  } | null;
  activity: {
    langs: Array<{
      name: string;
    }>;
  } | null;
  assignedUser: {
    id: number;
    name: string | null;
    lastname: string | null;
  } | null;
  reports: Array<{
    id: number;
  }>;
};

type CustomerActivityQueryOptions = {
  includeNoShow: boolean;
  languageId: number;
  orderBy: CustomerActivityOrderBy;
  orderDirection: CustomerActivityOrderDirection;
};

type CustomerActivityRangeQueryOptions = CustomerActivityQueryOptions & {
  startDate: string;
  endDate: string;
};

type AppHousekeepingFindManyArgs = NonNullable<Parameters<PrismaService["client"]["appHousekeeping"]["findMany"]>[0]>;
type CustomerActivityOrderByInput = AppHousekeepingFindManyArgs["orderBy"];

@Injectable()
export class CustomerActivitiesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getTodayForCustomer(session: CustomerAuthSession, options: CustomerActivityQueryOptions): Promise<CustomerTodayActivitiesResponse> {
    const ymd = getTodayInRomeYmd();
    const checkout = dateOnlyFromYmd(ymd);
    const structureKindIds = await this.getStructureKindIds();

    if (structureKindIds.length === 0) {
      return {
        date: { ymd },
        activities: [],
      };
    }

    const rows = (await this.prisma.client.appHousekeeping.findMany({
      where: {
        checkout,
        deletedAt: null,
        deletedAtClient: null,
        ...(options.includeNoShow ? {} : { noShow: 0 }),
        structure: {
          customerId: session.customerId,
          structureKindId: { in: structureKindIds },
        },
      },
      select: activitySelect(options.languageId),
      orderBy: orderByInput(options),
    })) as ActivityQueryRow[];

    return {
      date: { ymd },
      activities: rows.map(mapActivity),
    };
  }

  async getCalendarForCustomer(
    session: CustomerAuthSession,
    options: CustomerActivityRangeQueryOptions,
  ): Promise<CustomerCalendarActivitiesResponse> {
    const startDate = dateOnlyFromYmd(options.startDate);
    const endDate = dateOnlyFromYmd(options.endDate);
    const structureKindIds = await this.getStructureKindIds();

    if (structureKindIds.length === 0) {
      return {
        range: {
          startDate: options.startDate,
          endDate: options.endDate,
        },
        activities: [],
      };
    }

    const rows = (await this.prisma.client.appHousekeeping.findMany({
      where: {
        checkout: {
          gte: startDate,
          lte: endDate,
        },
        cleanedByUs: { gt: 0 },
        deletedAt: null,
        deletedAtClient: null,
        ...(options.includeNoShow ? {} : { noShow: 0 }),
        structure: {
          customerId: session.customerId,
          structureKindId: { in: structureKindIds },
        },
      },
      select: activitySelect(options.languageId),
      orderBy: orderByInput(options),
    })) as ActivityQueryRow[];

    return {
      range: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
      activities: rows.map(mapActivity),
    };
  }

  private async getStructureKindIds(): Promise<number[]> {
    const setting = await this.prisma.client.appSetting.findUnique({
      where: { key: STRUCTURE_KINDS_SETTING_KEY },
      select: { value: true },
    });

    return parseIntegerList(setting?.value ?? "");
  }
}

function activitySelect(languageId: number) {
  return {
    id: true,
    referenceId: true,
    structureId: true,
    operationId: true,
    activityId: true,
    checkout: true,
    checkoutTime: true,
    checkoutPax: true,
    checkin: true,
    checkinTime: true,
    checkinPax: true,
    noShow: true,
    deletedAtClient: true,
    cleanedByUs: true,
    startwork: true,
    startworkAt: true,
    startreport: true,
    startreportAt: true,
    cleaned: true,
    closed: true,
    deleted: true,
    sequence: true,
    updatedAt: true,
    deletedAt: true,
    structure: {
      select: {
        id: true,
        customerId: true,
        aptCode: true,
        logisticCode: true,
        name: true,
        nameFrontend: true,
        address1: true,
        city: true,
        postcode: true,
        alertKeys: true,
        structureKeys: true,
        customer: {
          select: {
            id: true,
            name: true,
            nameFrontend: true,
            color: true,
          },
        },
        state: {
          select: {
            isoCode: true,
          },
        },
      },
    },
    operation: {
      select: {
        langs: {
          where: { languageId },
          select: { name: true },
          take: 1,
        },
      },
    },
    activity: {
      select: {
        langs: {
          where: { languageId },
          select: { name: true },
          take: 1,
        },
      },
    },
    assignedUser: {
      select: {
        id: true,
        name: true,
        lastname: true,
      },
    },
    reports: {
      where: {
        deleted: 0,
        deletedAt: null,
      },
      select: {
        id: true,
      },
      take: 1,
    },
  };
}

function mapActivity(row: ActivityQueryRow): CustomerTodayActivity {
  return {
    id: row.id,
    referenceId: row.referenceId,
    structureId: row.structureId,
    operationId: row.operationId,
    activityId: row.activityId,
    checkout: formatDateYmd(row.checkout),
    checkoutTime: row.checkoutTime,
    checkoutPax: row.checkoutPax,
    checkin: formatDateYmd(row.checkin),
    checkinTime: row.checkinTime,
    checkinPax: row.checkinPax,
    noShow: row.noShow,
    deletedAtClient: toIsoOrNull(row.deletedAtClient),
    cleanedByUs: row.cleanedByUs,
    startwork: row.startwork,
    startworkAt: toIsoOrNull(row.startworkAt),
    startreport: row.startreport,
    startreportAt: toIsoOrNull(row.startreportAt),
    cleaned: row.cleaned,
    closed: row.closed,
    deleted: row.deleted,
    sequence: row.sequence,
    updatedAt: toIsoOrNull(row.updatedAt),
    deletedAt: toIsoOrNull(row.deletedAt),
    taskStatus: resolveTaskStatus(row),
    structure: {
      id: row.structure.id,
      customerId: row.structure.customerId,
      aptCode: row.structure.aptCode,
      logisticCode: row.structure.logisticCode,
      name: row.structure.name,
      nameFrontend: row.structure.nameFrontend,
      address1: row.structure.address1,
      city: row.structure.city,
      postcode: row.structure.postcode,
      alertKeys: row.structure.alertKeys,
      structureKeys: row.structure.structureKeys,
      customer: {
        id: row.structure.customer.id,
        name: row.structure.customer.name,
        nameFrontend: row.structure.customer.nameFrontend,
        color: row.structure.customer.color,
      },
      state: row.structure.state
        ? {
            isoCode: row.structure.state.isoCode,
          }
        : null,
    },
    operation: {
      id: row.operationId,
      name: row.operation?.langs[0]?.name ?? null,
    },
    activity: {
      id: row.activityId,
      name: row.activity?.langs[0]?.name ?? null,
    },
    assignedUser: row.assignedUser
      ? {
          id: row.assignedUser.id,
          name: row.assignedUser.name,
          lastname: row.assignedUser.lastname,
        }
      : null,
  };
}

function resolveTaskStatus(row: ActivityQueryRow): number {
  const cleanedByUs = row.cleanedByUs ?? 0;
  const startwork = row.startwork ?? 0;
  const startreport = row.startreport ?? 0;
  const cleaned = row.cleaned ?? 0;
  const closed = row.closed ?? 0;
  const reportExists = row.reports.length > 0;

  if (cleanedByUs > 0 && closed === 1) return 6;
  if (cleanedByUs > 0 && cleaned === 1 && closed === 0) return 5;
  if (cleanedByUs > 0 && startwork === 1 && startreport === 1 && reportExists) return 4;
  if (cleanedByUs > 0 && startwork === 1 && startreport === 1) return 3;
  if (cleanedByUs > 0 && startwork === 1) return 2;
  if (cleanedByUs > 0) return 1;
  return 0;
}

function parseIntegerList(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}

function getTodayInRomeYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function dateOnlyFromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function orderByInput(options: CustomerActivityQueryOptions): CustomerActivityOrderByInput {
  if (options.orderBy === TODAY_STATUS_NAME_FRONTEND_ORDER) {
    return [
      { startwork: "asc" },
      { startreport: "asc" },
      { structure: { nameFrontend: options.orderDirection } },
      { id: "asc" },
    ];
  }

  return {
    [options.orderBy]: options.orderDirection,
  };
}

function formatDateYmd(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
