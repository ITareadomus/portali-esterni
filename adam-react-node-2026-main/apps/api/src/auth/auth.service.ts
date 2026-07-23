import type { IncomingHttpHeaders } from "node:http";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { admin, organization } from "better-auth/plugins";
import { PrismaService } from "../prisma/prisma.service";

type BetterAuthRuntime = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (input: { headers: Headers }) => Promise<unknown>;
  };
};

@Injectable()
export class AuthService {
  readonly auth: BetterAuthRuntime;
  readonly nodeHandler: ReturnType<typeof toNodeHandler>;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    const baseURL = config.get<string>("BETTER_AUTH_URL", "http://localhost:3000");
    const trustedOrigins = [baseURL, config.get<string>("CORS_ORIGIN", baseURL)];

    const auth = betterAuth({
      appName: "ADAM",
      baseURL,
      basePath: "/api/auth",
      secret: config.get<string>("BETTER_AUTH_SECRET"),
      trustedOrigins: [...new Set(trustedOrigins)],
      database: prismaAdapter(prisma.client, {
        provider: "mysql",
      }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
      },
      plugins: [
        admin(),
        organization({
          allowUserToCreateOrganization: false,
        }),
      ],
    });

    this.auth = auth;
    this.nodeHandler = toNodeHandler(auth);
  }

  getSession(headers: IncomingHttpHeaders): Promise<unknown> {
    return this.auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
  }
}
