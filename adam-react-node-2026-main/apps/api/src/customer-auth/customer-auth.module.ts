import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAuthService } from "./customer-auth.service";
import { CustomerSessionGuard } from "./customer-session.guard";

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
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerSessionGuard],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
