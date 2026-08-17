import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DriverVehicleAssignmentService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolve today's driver for a vehicle from app_housekeeping.lg_vehicle + driven_by_us.
   */
  async resolveDriverIdForVehicle(vehicleId: number, ymd: string): Promise<number | null> {
    if (!Number.isInteger(vehicleId) || vehicleId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return null;
    }

    const rows = await this.prisma.client.$queryRaw<Array<{ driven_by_us: number | bigint }>>`
      SELECT driven_by_us
      FROM app_housekeeping
      WHERE lg_vehicle = ${vehicleId}
        AND (
          checkout = ${ymd}
          OR checkin = ${ymd}
        )
        AND IFNULL(deleted, 0) = 0
        AND deleted_at IS NULL
        AND driven_by_us > 0
      ORDER BY lg_sequence ASC, id ASC
      LIMIT 1
    `;

    const driverId = Number(rows[0]?.driven_by_us);
    return Number.isInteger(driverId) && driverId > 0 ? driverId : null;
  }

  async listStopIdsForVehicle(vehicleId: number, ymd: string): Promise<number[]> {
    if (!Number.isInteger(vehicleId) || vehicleId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return [];
    }

    const rows = await this.prisma.client.$queryRaw<Array<{ id: number | bigint }>>`
      SELECT id
      FROM app_housekeeping
      WHERE lg_vehicle = ${vehicleId}
        AND (
          checkout = ${ymd}
          OR checkin = ${ymd}
        )
        AND IFNULL(deleted, 0) = 0
        AND deleted_at IS NULL
      ORDER BY lg_sequence ASC, id ASC
    `;

    return rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
}
