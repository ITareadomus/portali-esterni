import type { IncomingHttpHeaders } from "node:http";
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { DriverAuthService, type DriverAuthSession } from "./driver-auth.service";

export type DriverSessionRequest = {
  headers: IncomingHttpHeaders;
  driverSession?: DriverAuthSession;
};

@Injectable()
export class DriverSessionGuard implements CanActivate {
  constructor(@Inject(DriverAuthService) private readonly driverAuth: DriverAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DriverSessionRequest>();
    const session = await this.driverAuth.readSessionFromHeaders(request.headers);

    if (!session) {
      throw new UnauthorizedException("Driver authentication required.");
    }

    request.driverSession = session;
    return true;
  }
}
