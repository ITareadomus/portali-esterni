import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DriverAccessBundle,
  DriverAccessKey,
  DriverStopStatusResponse,
  DriverTimelineStop,
  DriverTodayRouteResponse,
} from "@adam/types";
import type { DriverAuthSession } from "../driver-auth/driver-auth.service";
import { PrismaService } from "../prisma/prisma.service";

const ROME_TIME_ZONE = "Europe/Rome";
const KEY_CHOICE_TYPES: Record<number, string> = {
  0: "Classica",
  1: "Elettronica",
  2: "Codice",
  3: "QR Code",
};

const housekeepingStopSelect = {
  id: true,
  sequence: true,
  startTime: true,
  endTime: true,
  drivenByUs: true,
  lgSequence: true,
  lgTravelTime: true,
  lgStartTime: true,
  lgEndTime: true,
  lgOperation: true,
  notes: true,
  realStart: true,
  realEnd: true,
  lgPaused: true,
  checkout: true,
  checkoutTime: true,
  checkin: true,
  checkinTime: true,
  cleanedByUs: true,
  structure: {
    select: {
      logisticCode: true,
      address1: true,
      address2: true,
      lat: true,
      lng: true,
      premium: true,
      singleSofabeds: true,
      doubleSofabeds: true,
      structureKeys: true,
      customer: {
        select: {
          name: true,
          nameFrontend: true,
        },
      },
    },
  },
  activity: {
    select: {
      langs: {
        where: { languageId: 1 },
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
      mobile: true,
    },
  },
} as const;

@Injectable()
export class DriverTimelineService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getTodayForDriver(
    session: DriverAuthSession,
    options: { date?: string } = {},
  ): Promise<DriverTodayRouteResponse> {
    const ymd = options.date && isValidYmd(options.date) ? options.date : getTodayInRomeYmd();
    const driverProfile = await this.loadDriverProfile(session.driverId);
    const keyTypeLabels = await this.loadStructureKeyTypeLabels();

    // Compare DATE columns as YMD strings to avoid timezone shifts with JS Date.
    const idRows = await this.prisma.client.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM app_housekeeping
      WHERE driven_by_us = ${session.driverId}
        AND (
          checkout = ${ymd}
          OR checkin = ${ymd}
        )
        AND IFNULL(deleted, 0) = 0
        AND deleted_at IS NULL
      ORDER BY lg_sequence ASC, id ASC
    `;

    const taskIds = idRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const rows =
      taskIds.length === 0
        ? []
        : await this.prisma.client.appHousekeeping.findMany({
            where: { id: { in: taskIds } },
            orderBy: [{ lgSequence: "asc" }, { id: "asc" }],
            select: housekeepingStopSelect,
          });

    return {
      date: { ymd },
      driver: {
        id: session.driverId,
        name: driverProfile.name,
        lastname: driverProfile.lastname,
        startTime: null,
        endTime: null,
        available: null,
        selected: rows.length > 0,
        vehicle: null,
      },
      stops: rows.map((row) => mapHousekeepingStop(row, keyTypeLabels, ymd)),
    };
  }

  async markStopStarted(
    session: DriverAuthSession,
    stopId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, stopId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true, lgPaused: true, checkout: true },
    });

    if (!existing) {
      throw new NotFoundException("Housekeeping task not found.");
    }

    if (existing.realEnd) {
      throw new BadRequestException("Task already finished.");
    }

    const alreadyActive = Boolean(existing.realStart) && !isLgPaused(existing.lgPaused);
    if (alreadyActive) {
      return toStopStatusResponse(taskId, existing.realStart, null, false, formatDateYmd(existing.checkout));
    }

    await this.pauseOtherActiveTasksForDriver(session.driverId, taskId);

    const realStart = existing.realStart ?? nowAsTimeDate();
    if (!existing.realStart) {
      await this.prisma.client.appHousekeeping.update({
        where: { id: taskId },
        data: {
          realStart,
          lgPaused: 0,
        },
      });
    } else {
      await this.prisma.client.appHousekeeping.update({
        where: { id: taskId },
        data: { lgPaused: 0 },
      });
    }

    return toStopStatusResponse(taskId, realStart, null, false, formatDateYmd(existing.checkout));
  }

  async markStopFinished(
    session: DriverAuthSession,
    stopId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, stopId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true, lgPaused: true, checkout: true },
    });

    if (!existing) {
      throw new NotFoundException("Housekeeping task not found.");
    }

    if (!existing.realStart) {
      throw new BadRequestException("Start the task before finishing it.");
    }

    if (isLgPaused(existing.lgPaused) && !existing.realEnd) {
      throw new BadRequestException("Resume the task before finishing it.");
    }

    const realEnd = existing.realEnd ?? nowAsTimeDate();
    if (!existing.realEnd) {
      await this.prisma.client.appHousekeeping.update({
        where: { id: taskId },
        data: { realEnd, lgPaused: 0 },
      });
    }

    return toStopStatusResponse(taskId, existing.realStart, realEnd, false, formatDateYmd(existing.checkout));
  }

  async markStopReopened(
    session: DriverAuthSession,
    stopId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, stopId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true, checkout: true },
    });

    if (!existing) {
      throw new NotFoundException("Housekeeping task not found.");
    }

    if (!existing.realEnd) {
      throw new BadRequestException("Task is not finished.");
    }

    await this.pauseOtherActiveTasksForDriver(session.driverId, taskId);

    const realStart = nowAsTimeDate();
    await this.prisma.client.appHousekeeping.update({
      where: { id: taskId },
      data: { realStart, realEnd: null, lgPaused: 0 },
    });

    return toStopStatusResponse(taskId, realStart, null, false, formatDateYmd(existing.checkout));
  }

  private async resolveOwnedTaskId(session: DriverAuthSession, stopId: number): Promise<number> {
    const row = await this.prisma.client.appHousekeeping.findFirst({
      where: {
        id: stopId,
        drivenByUs: session.driverId,
        deleted: 0,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!row) {
      throw new NotFoundException("Timeline stop not found.");
    }

    return row.id;
  }

  private async pauseOtherActiveTasksForDriver(driverId: number, activeTaskId: number): Promise<void> {
    await this.prisma.client.appHousekeeping.updateMany({
      where: {
        drivenByUs: driverId,
        id: { not: activeTaskId },
        deleted: 0,
        deletedAt: null,
        realStart: { not: null },
        realEnd: null,
        lgPaused: 0,
      },
      data: { lgPaused: 1 },
    });
  }

  private async loadDriverProfile(
    driverId: number,
  ): Promise<{ name: string | null; lastname: string | null }> {
    const user = await this.prisma.client.appUser.findFirst({
      where: {
        id: driverId,
        active: 1,
      },
      select: {
        name: true,
        lastname: true,
      },
    });

    const name = user?.name?.trim() || null;
    const lastname = user?.lastname?.trim() || null;

    if (!user || (!name && !lastname)) {
      throw new NotFoundException("Nome e cognome autista mancanti in app_users.");
    }

    return { name, lastname };
  }

  private async loadStructureKeyTypeLabels(): Promise<Map<number, string>> {
    const rows = await this.prisma.client.appStructureKey.findMany({
      where: { active: 1 },
      select: { id: true, label: true },
    });

    const map = new Map<number, string>();
    for (const row of rows) {
      const id = Number(row.id);
      const label = row.label?.trim() || "";
      if (!Number.isInteger(id) || id <= 0 || !label) {
        continue;
      }
      map.set(id, label);
    }
    return map;
  }
}

type HousekeepingStopRow = {
  id: number;
  sequence: number | null;
  startTime: Date | null;
  endTime: Date | null;
  drivenByUs: number;
  lgSequence: number;
  lgTravelTime: number | null;
  lgStartTime: Date | null;
  lgEndTime: Date | null;
  lgOperation: string | null;
  notes: string | null;
  realStart: Date | null;
  realEnd: Date | null;
  lgPaused: number;
  checkout: Date | null;
  checkoutTime: string | null;
  checkin: Date | null;
  checkinTime: string | null;
  cleanedByUs: number | null;
  structure: {
    logisticCode: number | null;
    address1: string | null;
    address2: string | null;
    lat: string | null;
    lng: string | null;
    premium: number | null;
    singleSofabeds: number | null;
    doubleSofabeds: number | null;
    structureKeys: string | null;
    customer: {
      name: string | null;
      nameFrontend: string | null;
    };
  };
  activity: {
    langs: Array<{ name: string | null }>;
  } | null;
  assignedUser: {
    id: number;
    name: string | null;
    lastname: string | null;
    mobile: string | null;
  } | null;
};

function mapHousekeepingStop(
  row: HousekeepingStopRow,
  keyTypeLabels: Map<number, string>,
  ymd: string,
): DriverTimelineStop {
  const structure = row.structure;
  const customerName =
    structure.customer.nameFrontend?.trim() || structure.customer.name?.trim() || null;
  const cleaner = row.assignedUser;
  const cleanerAlias = formatPersonName(cleaner?.name, cleaner?.lastname);
  const activityName = row.activity?.langs[0]?.name?.trim() || null;
  const lgSequence = toNullableInt(row.lgSequence);
  const checkoutYmd = formatDateYmd(row.checkout) ?? ymd;
  const realStartIso = timeFieldToIso(row.realStart, checkoutYmd);
  const realEndIso = timeFieldToIso(row.realEnd, checkoutYmd);

  return {
    id: row.id,
    sequence: lgSequence !== null && lgSequence > 0 ? lgSequence : null,
    startTime: formatTime(row.lgStartTime),
    endTime: formatTime(row.lgEndTime),
    address: formatStructureAddress(structure),
    customerName,
    logisticCode: toNullableInt(structure.logisticCode),
    logisticsTaskKind: mapLgOperation(row.lgOperation),
    straordinaria: isStraordinariaActivity(activityName),
    premium: Boolean(structure.premium),
    customerNote: row.notes?.trim() || null,
    cleanerAlias,
    cleanerSequence: toNullableInt(row.sequence),
    cleanerMobile: cleaner?.mobile?.trim() || null,
    cleanerStartTime: formatTime(row.startTime),
    cleanerEndTime: formatTime(row.endTime),
    singleSofabeds: toNullableInt(structure.singleSofabeds),
    doubleSofabeds: toNullableInt(structure.doubleSofabeds),
    accessBundles: parseStructureAccessBundles(structure.structureKeys, keyTypeLabels),
    lat: toCoordinate(structure.lat),
    lng: toCoordinate(structure.lng),
    travelTime: toNullableInt(row.lgTravelTime),
    checkinDate: formatDateYmd(row.checkin),
    checkoutDate: checkoutYmd,
    checkinTime: formatTime(row.checkinTime),
    checkoutTime: formatTime(row.checkoutTime),
    taskId: row.id,
    isStarted: Boolean(realStartIso),
    isPaused: Boolean(realStartIso) && !realEndIso && isLgPaused(row.lgPaused),
    isFinished: Boolean(realEndIso),
    realStart: realStartIso,
    realEnd: realEndIso,
  };
}

function toStopStatusResponse(
  taskId: number,
  realStart: Date | string | null,
  realEnd: Date | string | null,
  lgPaused: boolean,
  checkoutYmd: string | null,
): DriverStopStatusResponse {
  const day = checkoutYmd && isValidYmd(checkoutYmd) ? checkoutYmd : getTodayInRomeYmd();
  const startIso = timeFieldToIso(realStart, day);
  const endIso = timeFieldToIso(realEnd, day);
  return {
    ok: true,
    timelineId: taskId,
    taskId,
    isStarted: Boolean(startIso),
    isPaused: Boolean(startIso) && !endIso && lgPaused,
    isFinished: Boolean(endIso),
    realStart: startIso,
    realEnd: endIso,
  };
}

function isLgPaused(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

/** Build a Date whose UTC clock equals current Europe/Rome time (for MySQL TIME columns). */
function nowAsTimeDate(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);
  return new Date(Date.UTC(1970, 0, 1, hour, minute, second));
}

function timeFieldToIso(value: Date | string | null | undefined, ymd: string): string | null {
  const time = formatTime(value);
  if (!time) {
    return null;
  }
  const [year, month, day] = ymd.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0)).toISOString();
}

function formatStructureAddress(structure: {
  address1: string | null;
  address2: string | null;
}): string | null {
  const street = [structure.address1?.trim(), structure.address2?.trim()].filter(Boolean).join(" ").trim();
  return street || null;
}

function parseStructureAccessBundles(
  raw: string | null | undefined,
  keyTypeLabels: Map<number, string>,
): DriverAccessBundle[] {
  if (!raw?.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const bundles: DriverAccessBundle[] = [];
  const seen = new Set<string>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id = toNullableInt(record.keys_id);
    const numberRaw = record.keys_number;
    const number =
      numberRaw === null || numberRaw === undefined || String(numberRaw).trim() === ""
        ? null
        : String(numberRaw).trim();
    const label = typeof record.keys_label === "string" ? record.keys_label.trim() || null : null;
    const typeId = toNullableInt(record.keys_type);
    const type = typeId !== null ? (keyTypeLabels.get(typeId) ?? null) : null;

    const keys: DriverAccessKey[] = [];
    const choices = record.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        if (!choice || typeof choice !== "object") {
          continue;
        }
        const choiceRecord = choice as Record<string, unknown>;
        const name =
          typeof choiceRecord.name === "string" ? choiceRecord.name.trim() : String(choiceRecord.name ?? "").trim();
        if (!name) {
          continue;
        }
        const choiceTypeId = toNullableInt(choiceRecord.type);
        keys.push({
          name,
          type: choiceTypeId !== null ? (KEY_CHOICE_TYPES[choiceTypeId] ?? null) : null,
        });
      }
    }

    const fingerprint = JSON.stringify({ id, number, label, typeId, keys });
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);

    bundles.push({ id, number, label, type, keys });
  }

  const driverBundles = bundles.filter((bundle) => isDriverAccessBundle(bundle.label));
  const preferred = driverBundles.length > 0 ? driverBundles : bundles;

  return preferred.sort((left, right) => {
    const leftNumber = Number(left.number);
    const rightNumber = Number(right.number);
    const leftRank = Number.isFinite(leftNumber) ? leftNumber : Number.POSITIVE_INFINITY;
    const rightRank = Number.isFinite(rightNumber) ? rightNumber : Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftId = left.id ?? Number.POSITIVE_INFINITY;
    const rightId = right.id ?? Number.POSITIVE_INFINITY;
    if (leftId !== rightId) {
      return leftId - rightId;
    }
    return (left.label ?? "").localeCompare(right.label ?? "", "it");
  });
}

function isDriverAccessBundle(label: string | null): boolean {
  if (!label) {
    return false;
  }
  return /autist/i.test(label);
}

function formatPersonName(name: string | null | undefined, lastname: string | null | undefined): string | null {
  const full = [name?.trim(), lastname?.trim()].filter(Boolean).join(" ").trim();
  return full || null;
}

function mapLgOperation(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/\//g, "");

  if (trimmed === "1" || compact === "d" || compact === "delivery" || compact === "consegna") {
    return "delivery";
  }
  if (trimmed === "2" || compact === "p" || compact === "pickup" || compact === "ritiro") {
    return "pickup";
  }
  if (
    trimmed === "3" ||
    compact === "d&p" ||
    compact === "dp" ||
    compact === "d+p" ||
    (compact.includes("delivery") && compact.includes("pickup")) ||
    (compact.includes("consegna") && compact.includes("ritiro"))
  ) {
    return "d&p";
  }

  return trimmed;
}

function isStraordinariaActivity(activityName: string | null): boolean {
  if (!activityName) {
    return false;
  }
  return /straordinar/i.test(activityName);
}

function toCoordinate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const number = Number(trimmed.replace(",", "."));
  return Number.isFinite(number) ? number : null;
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

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDateYmd(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function formatTime(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  const trimmed = String(value).trim();
  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }

  return trimmed;
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
