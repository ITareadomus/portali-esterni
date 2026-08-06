import { Module } from "@nestjs/common";
import { DriverAuthModule } from "../driver-auth/driver-auth.module";
import { LogisticsDbModule } from "../logistics-db/logistics-db.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DriverTimelineController } from "./driver-timeline.controller";
import { DriverTimelineService } from "./driver-timeline.service";

@Module({
  imports: [LogisticsDbModule, DriverAuthModule, PrismaModule],
  controllers: [DriverTimelineController],
  providers: [DriverTimelineService],
})
export class DriverTimelineModule {}
