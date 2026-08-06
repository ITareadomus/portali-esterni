import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DriverAccessBundle,
  DriverAccessKey,
  DriverStopStatusResponse,
  DriverTimelineStop,
  DriverTodayRouteResponse,
} from "@adam/types";
import type { DriverAuthSession } from "../driver-auth/driver-auth.service";
import { LogisticsDbService } from "../logistics-db/logistics-db.service";
import type {
  LgDriverDayRow,
  LgDriverVehicleAssignment,
  LgTimelineRow,
} from "../logistics-db/logistics.types";
import { PrismaService } from "../prisma/prisma.service";

const ROME_TIME_ZONE = "Europe/Rome";
const KEY_CHOICE_TYPES: Record<number, string> = {
  0: "Classica",
  1: "Elettronica",
  2: "Codice",
  3: "QR Code",
};

type AdamStopContext = {
  logisticCode: number | null;
  customerName: string | null;
  address: string | null;
  customerNote: string | null;
  cleanerAlias: string | null;
  cleanerSequence: number | null;
  cleanerMobile: string | null;
  cleanerStartTime: string | null;
  cleanerEndTime: string | null;
  singleSofabeds: number | null;
  doubleSofabeds: number | null;
  checkinDate: string | null;
  checkoutDate: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
  logisticsTaskKind: string | null;
  straordinaria: boolean;
  premium: boolean;
  lat: number | null;
  lng: number | null;
  sequence: number | null;
  startTime: string | null;
  endTime: string | null;
  travelTime: number | null;
  drivenByUs: number | null;
  realStart: string | null;
  realEnd: string | null;
  lgPaused: boolean;
  accessBundles: DriverAccessBundle[];
};

type SofabedContext = {
  singleSofabeds: number | null;
  doubleSofabeds: number | null;
};

@Injectable()
export class DriverTimelineService {
  constructor(
    @Inject(LogisticsDbService)
    private readonly logisticsDb: LogisticsDbService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getTodayForDriver(
    session: DriverAuthSession,
    options: { date?: string } = {},
  ): Promise<DriverTodayRouteResponse> {
    const ymd = options.date && isValidYmd(options.date) ? options.date : getTodayInRomeYmd();

    const [dayResult, timelineResult] = await Promise.all([
      this.logisticsDb.query<LgDriverDayRow>(
        `SELECT
           base.driver_id,
           base.work_date,
           d.start_time,
           d.end_time,
           d.available,
           (s.id IS NOT NULL) AS selected,
           CASE
             WHEN s.vehicle_assignments ? base.driver_id::text
             THEN s.vehicle_assignments -> base.driver_id::text
             ELSE NULL
           END AS vehicle_assignment
         FROM (SELECT $1::int AS driver_id, $2::date AS work_date) base
         LEFT JOIN lg_drivers d
           ON d.driver_id = base.driver_id
          AND d.work_date = base.work_date
         LEFT JOIN lg_selected_drivers s
           ON s.work_date = base.work_date
          AND base.driver_id = ANY(s.drivers)
         LIMIT 1`,
        [session.driverId, ymd],
      ),
      this.logisticsDb.query<LgTimelineRow>(
        `SELECT
           id, work_date, driver_id, task_id, logistic_code,
           address, lat, lng, checkin_date, checkout_date, checkin_time, checkout_time,
           straordinaria, customer_name, start_time, end_time, sequence, travel_time,
           logistics_task_kind
         FROM lg_timeline
         WHERE driver_id = $1 AND work_date = $2::date
         ORDER BY sequence ASC NULLS LAST, id ASC`,
        [session.driverId, ymd],
      ),
    ]);

    const day = dayResult.rows[0] ?? null;
    const stops = timelineResult.rows;
    const vehicle = mapVehicle(day?.vehicle_assignment ?? null);
    const driverProfile = await this.loadDriverProfile(session.driverId);

    const taskIds = stops
      .map((stop) => Number(stop.task_id))
      .filter((taskId): taskId is number => Number.isInteger(taskId) && taskId > 0);
    const logisticCodes = stops
      .map((stop) => Number(stop.logistic_code))
      .filter((code): code is number => Number.isInteger(code) && code > 0);

    const [adamByTaskId, premiumByTaskId, sofabedsByLogisticCode] = await Promise.all([
      this.loadAdamStopContext(taskIds),
      this.loadPremiumByTaskId(ymd, taskIds),
      this.loadSofabedsByLogisticCode(logisticCodes),
    ]);

    return {
      date: { ymd },
      driver: {
        id: session.driverId,
        name: driverProfile.name,
        lastname: driverProfile.lastname,
        startTime: formatTime(day?.start_time),
        endTime: formatTime(day?.end_time),
        available: day?.available ?? null,
        selected: Boolean(day?.selected),
        vehicle,
      },
      stops: stops.map((row) => {
        const taskId = Number(row.task_id);
        const logisticCode = Number(row.logistic_code);
        const adam =
          Number.isInteger(taskId) && taskId > 0 ? (adamByTaskId.get(taskId) ?? null) : null;
        const premium =
          adam?.premium === true
            ? true
            : Number.isInteger(taskId) && taskId > 0
              ? Boolean(premiumByTaskId.get(taskId))
              : false;
        const sofabeds =
          adam?.singleSofabeds != null || adam?.doubleSofabeds != null
            ? {
                singleSofabeds: adam.singleSofabeds,
                doubleSofabeds: adam.doubleSofabeds,
              }
            : Number.isInteger(logisticCode) && logisticCode > 0
              ? (sofabedsByLogisticCode.get(logisticCode) ?? null)
              : null;
        return mapStop(row, adam, sofabeds, premium);
      }),
    };
  }

  async markStopStarted(
    session: DriverAuthSession,
    timelineId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, timelineId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true, lgPaused: true },
    });

    if (!existing) {
      throw new NotFoundException("Housekeeping task not found.");
    }

    if (existing.realEnd) {
      throw new BadRequestException("Task already finished.");
    }

    const alreadyActive = Boolean(existing.realStart) && !isLgPaused(existing.lgPaused);
    if (alreadyActive) {
      return toStopStatusResponse(timelineId, taskId, existing.realStart, null, false);
    }

    await this.pauseOtherActiveTasksForDriver(session.driverId, taskId);

    const realStart = existing.realStart ?? new Date();
    await this.prisma.client.appHousekeeping.update({
      where: { id: taskId },
      data: {
        realStart,
        lgPaused: 0,
      },
    });

    return toStopStatusResponse(timelineId, taskId, realStart, null, false);
  }

  async markStopFinished(
    session: DriverAuthSession,
    timelineId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, timelineId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true, lgPaused: true },
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

    const realEnd = existing.realEnd ?? new Date();
    if (!existing.realEnd) {
      await this.prisma.client.appHousekeeping.update({
        where: { id: taskId },
        data: { realEnd, lgPaused: 0 },
      });
    }

    return toStopStatusResponse(timelineId, taskId, existing.realStart, realEnd, false);
  }

  async markStopReopened(
    session: DriverAuthSession,
    timelineId: number,
  ): Promise<DriverStopStatusResponse> {
    const taskId = await this.resolveOwnedTaskId(session, timelineId);
    const existing = await this.prisma.client.appHousekeeping.findFirst({
      where: { id: taskId, deleted: 0, deletedAt: null },
      select: { id: true, realStart: true, realEnd: true },
    });

    if (!existing) {
      throw new NotFoundException("Housekeeping task not found.");
    }

    if (!existing.realEnd) {
      throw new BadRequestException("Task is not finished.");
    }

    await this.pauseOtherActiveTasksForDriver(session.driverId, taskId);

    const realStart = new Date();
    await this.prisma.client.appHousekeeping.update({
      where: { id: taskId },
      data: { realStart, realEnd: null, lgPaused: 0 },
    });

    return toStopStatusResponse(timelineId, taskId, realStart, null, false);
  }

  private async resolveOwnedTaskId(session: DriverAuthSession, timelineId: number): Promise<number> {
    const result = await this.logisticsDb.query<{ task_id: number | null }>(
      `SELECT task_id
       FROM lg_timeline
       WHERE id = $1
         AND driver_id = $2
       LIMIT 1`,
      [timelineId, session.driverId],
    );

    const taskId = toNullableInt(result.rows[0]?.task_id);
    if (taskId === null || taskId <= 0) {
      throw new NotFoundException("Timeline stop not found.");
    }

    return taskId;
  }

  private async pauseOtherActiveTasksForDriver(driverId: number, activeTaskId: number): Promise<void> {
    const result = await this.logisticsDb.query<{ task_id: number | null }>(
      `SELECT DISTINCT task_id
       FROM lg_timeline
       WHERE driver_id = $1
         AND task_id IS NOT NULL
         AND task_id <> $2`,
      [driverId, activeTaskId],
    );

    const otherTaskIds = [
      ...new Set(
        result.rows
          .map((row) => toNullableInt(row.task_id))
          .filter((id): id is number => id !== null && id > 0),
      ),
    ];

    if (otherTaskIds.length === 0) {
      return;
    }

    await this.prisma.client.appHousekeeping.updateMany({
      where: {
        id: { in: otherTaskIds },
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

  private async loadAdamStopContext(taskIds: number[]): Promise<Map<number, AdamStopContext>> {
    const uniqueTaskIds = [...new Set(taskIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqueTaskIds.length === 0) {
      return new Map();
    }

    const [rows, keyTypeLabels] = await Promise.all([
      this.prisma.client.appHousekeeping.findMany({
        where: {
          id: { in: uniqueTaskIds },
          deleted: 0,
          deletedAt: null,
        },
        select: {
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
        },
      }),
      this.loadStructureKeyTypeLabels(),
    ]);

    const map = new Map<number, AdamStopContext>();
    for (const row of rows) {
      if (map.has(row.id)) {
        continue;
      }

      const structure = row.structure;
      const customerName =
        structure.customer.nameFrontend?.trim() || structure.customer.name?.trim() || null;
      const cleaner = row.assignedUser;
      const cleanerAlias = formatPersonName(cleaner?.name, cleaner?.lastname);
      const cleanerMobile = cleaner?.mobile?.trim() || null;
      const activityName = row.activity?.langs[0]?.name?.trim() || null;
      const lgSequence = toNullableInt(row.lgSequence);
      const drivenByUs = toNullableInt(row.drivenByUs);

      map.set(row.id, {
        logisticCode: toNullableInt(structure.logisticCode),
        customerName,
        address: formatStructureAddress(structure),
        customerNote: row.notes?.trim() || null,
        cleanerAlias,
        cleanerSequence: toNullableInt(row.sequence),
        cleanerMobile,
        cleanerStartTime: formatTime(row.startTime),
        cleanerEndTime: formatTime(row.endTime),
        singleSofabeds: toNullableInt(structure.singleSofabeds),
        doubleSofabeds: toNullableInt(structure.doubleSofabeds),
        checkinDate: formatDateYmd(row.checkin),
        checkoutDate: formatDateYmd(row.checkout),
        checkinTime: formatTime(row.checkinTime),
        checkoutTime: formatTime(row.checkoutTime),
        logisticsTaskKind: row.lgOperation?.trim() || null,
        straordinaria: isStraordinariaActivity(activityName),
        premium: Boolean(structure.premium),
        lat: toCoordinate(structure.lat),
        lng: toCoordinate(structure.lng),
        sequence: lgSequence !== null && lgSequence > 0 ? lgSequence : null,
        startTime: formatTime(row.lgStartTime),
        endTime: formatTime(row.lgEndTime),
        travelTime: toNullableInt(row.lgTravelTime),
        drivenByUs: drivenByUs !== null && drivenByUs > 0 ? drivenByUs : null,
        realStart: toIsoOrNull(row.realStart),
        realEnd: toIsoOrNull(row.realEnd),
        lgPaused: isLgPaused(row.lgPaused),
        accessBundles: parseStructureAccessBundles(structure.structureKeys, keyTypeLabels),
      });
    }

    return map;
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

  private async loadPremiumByTaskId(ymd: string, taskIds: number[]): Promise<Map<number, boolean>> {
    const uniqueTaskIds = [...new Set(taskIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqueTaskIds.length === 0) {
      return new Map();
    }

    const result = await this.logisticsDb.query<{ task_id: number; premium: boolean | null }>(
      `SELECT DISTINCT ON (dac.task_id)
         dac.task_id,
         COALESCE(dac.premium, false) AS premium
       FROM daily_assignments_current dac
       WHERE dac.work_date = $1::date
         AND dac.task_id = ANY($2::int[])
       ORDER BY dac.task_id, dac.id ASC`,
      [ymd, uniqueTaskIds],
    );

    const map = new Map<number, boolean>();
    for (const row of result.rows) {
      const taskId = Number(row.task_id);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        continue;
      }
      map.set(taskId, Boolean(row.premium));
    }

    return map;
  }

  private async loadSofabedsByLogisticCode(logisticCodes: number[]): Promise<Map<number, SofabedContext>> {
    const uniqueCodes = [
      ...new Set(logisticCodes.map((code) => Number(code)).filter((code) => Number.isInteger(code) && code > 0)),
    ];
    if (uniqueCodes.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.client.appStructure.findMany({
      where: {
        logisticCode: { in: uniqueCodes },
      },
      select: {
        logisticCode: true,
        singleSofabeds: true,
        doubleSofabeds: true,
      },
    });

    const map = new Map<number, SofabedContext>();
    for (const row of rows) {
      const logisticCode = toNullableInt(row.logisticCode);
      if (logisticCode === null || map.has(logisticCode)) {
        continue;
      }

      const singleSofabeds = toNullableInt(row.singleSofabeds);
      const doubleSofabeds = toNullableInt(row.doubleSofabeds);
      if (singleSofabeds === null && doubleSofabeds === null) {
        continue;
      }

      map.set(logisticCode, { singleSofabeds, doubleSofabeds });
    }

    return map;
  }
}

function mapVehicle(
  raw: LgDriverVehicleAssignment | string | null,
): DriverTodayRouteResponse["driver"]["vehicle"] {
  if (!raw) {
    return null;
  }

  const assignment =
    typeof raw === "string" ? (JSON.parse(raw) as LgDriverVehicleAssignment) : raw;

  const id = toNullableInt(assignment.vehicle_id);
  const name = assignment.vehicle_name ?? null;
  const pmsCode = assignment.vehicle_pms_code ?? null;
  const taskId = toNullableInt(assignment.vehicle_task_id);

  if (id === null && !name && !pmsCode && taskId === null) {
    return null;
  }

  return {
    id,
    name,
    pmsCode,
    taskId,
  };
}

function mapStop(
  row: LgTimelineRow,
  adam: AdamStopContext | null,
  sofabeds: SofabedContext | null,
  premium: boolean,
): DriverTimelineStop {
  return {
    id: row.id,
    sequence: adam?.sequence ?? row.sequence,
    startTime: adam?.startTime ?? formatTime(row.start_time),
    endTime: adam?.endTime ?? formatTime(row.end_time),
    address: adam?.address ?? row.address,
    customerName: adam?.customerName ?? row.customer_name,
    logisticCode: adam?.logisticCode ?? row.logistic_code,
    logisticsTaskKind: adam?.logisticsTaskKind ?? row.logistics_task_kind,
    straordinaria: adam ? adam.straordinaria : Boolean(row.straordinaria),
    premium,
    customerNote: adam?.customerNote ?? null,
    cleanerAlias: adam?.cleanerAlias ?? null,
    cleanerSequence: adam?.cleanerSequence ?? null,
    cleanerMobile: adam?.cleanerMobile ?? null,
    cleanerStartTime: adam?.cleanerStartTime ?? null,
    cleanerEndTime: adam?.cleanerEndTime ?? null,
    singleSofabeds: sofabeds?.singleSofabeds ?? null,
    doubleSofabeds: sofabeds?.doubleSofabeds ?? null,
    accessBundles: adam?.accessBundles ?? [],
    lat: adam?.lat ?? toNumberOrNull(row.lat),
    lng: adam?.lng ?? toNumberOrNull(row.lng),
    travelTime: adam?.travelTime ?? toNumberOrNull(row.travel_time),
    checkinDate: adam?.checkinDate ?? formatDateYmd(row.checkin_date),
    checkoutDate: adam?.checkoutDate ?? formatDateYmd(row.checkout_date),
    checkinTime: adam?.checkinTime ?? formatTime(row.checkin_time),
    checkoutTime: adam?.checkoutTime ?? formatTime(row.checkout_time),
    taskId: toNumberOrNull(row.task_id),
    isStarted: Boolean(adam?.realStart),
    isPaused: Boolean(adam?.realStart) && !adam?.realEnd && Boolean(adam?.lgPaused),
    isFinished: Boolean(adam?.realEnd),
    realStart: adam?.realStart ?? null,
    realEnd: adam?.realEnd ?? null,
  };
}

function toStopStatusResponse(
  timelineId: number,
  taskId: number,
  realStart: Date | string | null,
  realEnd: Date | string | null,
  lgPaused: boolean,
): DriverStopStatusResponse {
  const startIso = toIsoOrNull(realStart);
  const endIso = toIsoOrNull(realEnd);
  return {
    ok: true,
    timelineId,
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

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

function toNumberOrNull(value: number | string | null | undefined): number | null {
  return toNullableInt(value);
}
