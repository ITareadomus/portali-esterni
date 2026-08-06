import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "../prisma/prisma.module";
import { DriverAuthController } from "./driver-auth.controller";
import { DriverAuthService } from "./driver-auth.service";
import { DriverSessionGuard } from "./driver-session.guard";

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
  providers: [DriverAuthService, DriverSessionGuard],
  exports: [DriverAuthService, DriverSessionGuard],
})
export class DriverAuthModule {}
