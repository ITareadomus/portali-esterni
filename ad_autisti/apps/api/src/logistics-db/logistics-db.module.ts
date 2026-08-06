import { Global, Module } from "@nestjs/common";
import { LogisticsDbService } from "./logistics-db.service";

@Global()
@Module({
  providers: [LogisticsDbService],
  exports: [LogisticsDbService],
})
export class LogisticsDbModule {}
