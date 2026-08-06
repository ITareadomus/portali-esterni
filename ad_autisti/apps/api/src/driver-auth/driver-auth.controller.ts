import type { IncomingHttpHeaders } from "node:http";
import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { DriverAuthLogoutResponse, DriverAuthMeResponse } from "@adam/types";
import { DriverAuthService, DRIVER_SESSION_COOKIE } from "./driver-auth.service";
import { DriverSessionGuard, type DriverSessionRequest } from "./driver-session.guard";
import { DriverLoginDto } from "./dto/driver-login.dto";

type CookieResponse = {
  cookie: (name: string, value: string, options: object) => void;
  clearCookie: (name: string, options: object) => void;
};

type DriverAuthRequest = {
  headers: IncomingHttpHeaders;
};

@ApiTags("driver-auth")
@Controller("driver-auth")
export class DriverAuthController {
  constructor(
    @Inject(DriverAuthService)
    private readonly driverAuth: DriverAuthService,
  ) {}

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        user: {
          id: 737,
          name: "Mario",
          lastname: "Rossi",
        },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: "Too many driver login attempts." })
  @ApiUnauthorizedResponse({ description: "Lo user non è corretto." })
  @ApiForbiddenResponse({ description: "Untrusted driver auth origin." })
  async login(
    @Body() dto: DriverLoginDto,
    @Req() request: DriverAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    this.driverAuth.assertTrustedOrigin(request.headers);
    const result = await this.driverAuth.login(dto);
    response.cookie(DRIVER_SESSION_COOKIE, result.cookieValue, result.cookieOptions);
    return result.response;
  }

  @Get("me")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        authenticated: true,
        user: {
          id: 737,
          name: "CHRISTOPHER JASON",
          lastname: "SANTOS",
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  me(@Req() request: DriverSessionRequest): Promise<DriverAuthMeResponse> {
    return this.driverAuth.me(request.driverSession!);
  }

  @Post("logout")
  @ApiOkResponse({ schema: { example: { ok: true } } })
  @ApiForbiddenResponse({ description: "Untrusted driver auth origin." })
  async logout(
    @Req() request: DriverAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<DriverAuthLogoutResponse> {
    this.driverAuth.assertTrustedOrigin(request.headers);
    await this.driverAuth.logout();
    response.clearCookie(DRIVER_SESSION_COOKIE, this.driverAuth.getClearCookieOptions());
    return { ok: true };
  }
}
