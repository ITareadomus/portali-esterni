import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CustomerAuthModule } from "./customer-auth/customer-auth.module";
import { CustomerActivitiesModule } from "./customer-activities/customer-activities.module";
import { DriverAuthModule } from "./driver-auth/driver-auth.module";
import { DriverTimelineModule } from "./driver-timeline/driver-timeline.module";
import { HealthModule } from "./health/health.module";
import { PlatformContextModule } from "./platform-context/platform-context.module";

const apiEnvFilePath = [join(__dirname, "../.env.local"), join(__dirname, "../.env")];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvFilePath,
    }),
    HealthModule,
    AuthModule,
    CustomerAuthModule,
    CustomerActivitiesModule,
    DriverAuthModule,
    DriverTimelineModule,
    PlatformContextModule,
  ],
})
export class AppModule {}
