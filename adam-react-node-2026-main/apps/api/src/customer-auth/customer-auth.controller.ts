import type { IncomingHttpHeaders } from "node:http";
import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { CustomerAuthLogoutResponse, CustomerAuthMeResponse } from "@adam/types";
import { CustomerAuthService, CUSTOMER_SESSION_COOKIE } from "./customer-auth.service";
import { CustomerSessionGuard, type CustomerSessionRequest } from "./customer-session.guard";
import { CustomerLoginDto } from "./dto/customer-login.dto";

type CookieResponse = {
  cookie: (name: string, value: string, options: object) => void;
  clearCookie: (name: string, options: object) => void;
};

type CustomerAuthRequest = {
  headers: IncomingHttpHeaders;
};

@ApiTags("customer-auth")
@Controller("customer-auth")
export class CustomerAuthController {
  constructor(
    @Inject(CustomerAuthService)
    private readonly customerAuth: CustomerAuthService,
  ) {}

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        user: {
          id: 1,
          email: "cliente@example.com",
          name: "Cliente ADAM",
          tenantId: 1,
        },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: "Too many customer login attempts." })
  @ApiUnauthorizedResponse({ description: "Invalid customer credentials." })
  @ApiForbiddenResponse({ description: "Untrusted customer auth origin." })
  async login(
    @Body() dto: CustomerLoginDto,
    @Req() request: CustomerAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    this.customerAuth.assertTrustedOrigin(request.headers);
    const result = await this.customerAuth.login(dto, { headers: request.headers });
    response.cookie(CUSTOMER_SESSION_COOKIE, result.cookieValue, result.cookieOptions);
    return result.response;
  }

  @Get("me")
  @UseGuards(CustomerSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        authenticated: true,
        user: {
          id: 1,
          email: "cliente@example.com",
          name: "Cliente ADAM",
          tenantId: 1,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid customer session." })
  me(@Req() request: CustomerSessionRequest): Promise<CustomerAuthMeResponse> {
    return this.customerAuth.me(request.customerSession!);
  }

  @Post("logout")
  @ApiOkResponse({ schema: { example: { ok: true } } })
  @ApiForbiddenResponse({ description: "Untrusted customer auth origin." })
  async logout(
    @Req() request: CustomerAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<CustomerAuthLogoutResponse> {
    this.customerAuth.assertTrustedOrigin(request.headers);
    await this.customerAuth.logout(request.headers);
    response.clearCookie(CUSTOMER_SESSION_COOKIE, this.customerAuth.getClearCookieOptions());
    return { ok: true };
  }
}
