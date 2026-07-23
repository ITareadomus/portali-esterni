import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformContextController } from "./platform-context.controller";
import { PlatformContextService } from "./platform-context.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PlatformContextController],
  providers: [PlatformContextService],
})
export class PlatformContextModule {}
