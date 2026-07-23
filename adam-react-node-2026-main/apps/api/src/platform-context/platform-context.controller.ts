import type { IncomingHttpHeaders } from "node:http";
import { Controller, Get, Req } from "@nestjs/common";
import { ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { PlatformContextResponse } from "@adam/types";
import { PlatformContextService } from "./platform-context.service";

type RequestWithHeaders = {
  headers: IncomingHttpHeaders;
};

@ApiTags("platform-context")
@Controller("platform-context")
export class PlatformContextController {
  constructor(private readonly platformContext: PlatformContextService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        user: {
          id: "usr_123",
          email: "admin@example.com",
          name: "Platform Admin",
          role: "admin",
        },
        platform: {
          role: "admin",
          tenantBound: false,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid Better Auth session." })
  @ApiForbiddenResponse({ description: "The authenticated user is not a platform admin." })
  get(@Req() request: RequestWithHeaders): Promise<PlatformContextResponse> {
    return this.platformContext.get(request.headers);
  }
}
