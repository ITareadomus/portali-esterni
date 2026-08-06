import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomerAuthModule } from "../customer-auth/customer-auth.module";
import { CustomerActivitiesController } from "./customer-activities.controller";
import { CustomerActivitiesService } from "./customer-activities.service";

@Module({
  imports: [CustomerAuthModule, PrismaModule],
  controllers: [CustomerActivitiesController],
  providers: [CustomerActivitiesService],
})
export class CustomerActivitiesModule {}
