import type { IncomingHttpHeaders } from "node:http";
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { CustomerAuthService, type CustomerAuthSession } from "./customer-auth.service";

export type CustomerSessionRequest = {
  headers: IncomingHttpHeaders;
  customerSession?: CustomerAuthSession;
};

@Injectable()
export class CustomerSessionGuard implements CanActivate {
  constructor(@Inject(CustomerAuthService) private readonly customerAuth: CustomerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerSessionRequest>();
    const session = await this.customerAuth.readSessionFromHeaders(request.headers);

    if (!session) {
      throw new UnauthorizedException("Customer authentication required.");
    }

    request.customerSession = session;
    return true;
  }
}
