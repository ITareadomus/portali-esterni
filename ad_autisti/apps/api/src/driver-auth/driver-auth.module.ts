import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "../prisma/prisma.module";
import { DriverAuthController } from "./driver-auth.controller";
import { DriverAuthService } from "./driver-auth.service";
import { DriverSessionGuard } from "./driver-session.guard";
import { DriverVehicleAssignmentService } from "./driver-vehicle-assignment.service";

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 5,
        },
      ],
    }),
  ],
  controllers: [DriverAuthController],
  providers: [DriverAuthService, DriverSessionGuard, DriverVehicleAssignmentService],
  exports: [DriverAuthService, DriverSessionGuard, DriverVehicleAssignmentService],
})
export class DriverAuthModule {}
