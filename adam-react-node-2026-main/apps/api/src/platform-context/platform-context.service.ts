import type { IncomingHttpHeaders } from "node:http";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PlatformContextResponse } from "@adam/types";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

type BetterAuthSessionPayload = {
  session?: {
    userId?: unknown;
  };
  user?: {
    id?: unknown;
  };
};

@Injectable()
export class PlatformContextService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async get(headers: IncomingHttpHeaders): Promise<PlatformContextResponse> {
    const userId = this.parseUserId(await this.auth.getSession(headers));
    if (!userId) {
      throw new UnauthorizedException("Authentication required.");
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Authenticated user not found.");
    }

    if (user.role !== "admin") {
      throw new ForbiddenException("Platform admin role required.");
    }

    return {
      user: {
        ...user,
        role: "admin",
      },
      platform: {
        role: "admin",
        tenantBound: false,
      },
    };
  }

  private parseUserId(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) {
      return null;
    }

    const session = payload as BetterAuthSessionPayload;
    return this.getRequiredString(session.user?.id) ?? this.getRequiredString(session.session?.userId);
  }

  private getRequiredString(value: unknown): string | null {
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }

    return value;
  }
}
