import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { HealthResponse } from "@adam/types";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
