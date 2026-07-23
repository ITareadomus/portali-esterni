import type { IncomingHttpHeaders } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  type CustomerAuthLoginResponse,
  type CustomerAuthMeResponse,
  type CustomerAuthUser,
} from "@adam/types";
import { PrismaService } from "../prisma/prisma.service";
import type { CustomerLoginDto } from "./dto/customer-login.dto";

export const CUSTOMER_SESSION_COOKIE = CUSTOMER_SESSION_COOKIE_NAME;

export type CustomerAuthSession = {
  customerId: number;
  tenantId: number;
  expiresAt: Date;
  remember: boolean;
};

type CustomerSessionPayload = {
  v: 1;
  sub: number;
  tid: number;
  exp: number;
  rm: boolean;
  sel?: string;
  tok?: string;
};

type CookieOptions = {
  expires?: Date;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
};

type CustomerLoginContext = {
  headers: IncomingHttpHeaders;
};

type RememberToken = {
  selector: string;
  token: string;
};

const LOCAL_DEV_SECRET = "local-dev-customer-auth-secret-change-me";
const CUSTOMER_SESSION_VERSION = "v1";
const CUSTOMER_SESSION_ALGORITHM = "aes-256-gcm";
const CUSTOMER_SESSION_AAD = Buffer.from("adam.customer-session.v1", "utf8");
const CUSTOMER_SESSION_IV_BYTES = 12;
const CUSTOMER_SESSION_TAG_BYTES = 16;
const CUSTOMER_REMEMBER_TOKEN_BYTES = 32;
const CUSTOMER_AUTH_MIN_PRODUCTION_SECRET_LENGTH = 32;
const DUMMY_BCRYPT_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8hV/vqyE2E.4oW1nO2lEID3Ajw7uEu";

@Injectable()
export class CustomerAuthService {
  private readonly secret: string;
  private readonly sessionKey: Buffer;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {
    const customerSecret = this.config.get<string>("CUSTOMER_AUTH_SECRET")?.trim();
    const isProduction = this.config.get<string>("NODE_ENV") === "production";

    if (!customerSecret && isProduction) {
      throw new Error("CUSTOMER_AUTH_SECRET is required in production.");
    }

    if (customerSecret && isProduction && customerSecret.length < CUSTOMER_AUTH_MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(`CUSTOMER_AUTH_SECRET must be at least ${CUSTOMER_AUTH_MIN_PRODUCTION_SECRET_LENGTH} characters in production.`);
    }

    this.secret = customerSecret && customerSecret !== "" ? customerSecret : LOCAL_DEV_SECRET;
    this.sessionKey = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(this.secret, "utf8"),
        Buffer.from("adam.customer-auth", "utf8"),
        Buffer.from("session-cookie-encryption", "utf8"),
        32,
      ),
    );
  }

  async login(
    dto: CustomerLoginDto,
    context?: CustomerLoginContext,
  ): Promise<{
    response: CustomerAuthLoginResponse;
    cookieValue: string;
    cookieOptions: CookieOptions;
  }> {
    const tenantId = this.getTenantId();
    const customer = await this.prisma.client.appCustomer.findFirst({
      where: {
        email: dto.email.trim(),
        active: 1,
        deletedAt: null,
        admTenantId: tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameFrontend: true,
        password: true,
        admTenantId: true,
      },
    });

    if (!customer) {
      await this.verifyPassword(dto.password, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedException("Invalid customer credentials.");
    }

    const isValid = await this.verifyPassword(dto.password, customer.password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid customer credentials.");
    }

    const remember = dto.remember === true;
    const expiresAt = this.getExpirationDate(remember);
    const user = this.toUser(customer);
    const rememberToken = remember ? this.createRememberToken() : null;

    if (rememberToken) {
      await this.prisma.client.appCustomerRememberToken.create({
        data: {
          admTenantId: user.tenantId,
          customerId: user.id,
          expiresAt,
          selector: rememberToken.selector,
          tokenHash: this.hashRememberToken(rememberToken.token),
          userAgentHash: this.hashOptionalHeader(context?.headers["user-agent"]),
        },
      });
    }

    return {
      response: {
        ok: true,
        user,
      },
      cookieValue: this.createSessionCookie({
        v: 1,
        sub: user.id,
        tid: user.tenantId,
        exp: Math.floor(expiresAt.getTime() / 1000),
        rm: remember,
        sel: rememberToken?.selector,
        tok: rememberToken?.token,
      }),
      cookieOptions: this.getCookieOptions(expiresAt, remember),
    };
  }

  async me(session: CustomerAuthSession): Promise<CustomerAuthMeResponse> {
    const customer = await this.prisma.client.appCustomer.findFirst({
      where: {
        id: session.customerId,
        active: 1,
        deletedAt: null,
        admTenantId: session.tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameFrontend: true,
        admTenantId: true,
      },
    });

    if (!customer) {
      throw new UnauthorizedException("Customer session is no longer valid.");
    }

    return {
      authenticated: true,
      user: this.toUser(customer),
    };
  }

  async readSessionFromHeaders(headers: IncomingHttpHeaders): Promise<CustomerAuthSession | null> {
    const token = this.readCookie(headers, CUSTOMER_SESSION_COOKIE);
    if (!token) {
      return null;
    }

    const payload = this.decryptSessionCookie(token);
    if (!payload || payload.tid !== this.getTenantId()) {
      return null;
    }

    if (payload.rm) {
      const isRememberTokenValid = await this.verifyRememberToken(payload);
      if (!isRememberTokenValid) {
        return null;
      }
    }

    return {
      customerId: payload.sub,
      tenantId: payload.tid,
      expiresAt: new Date(payload.exp * 1000),
      remember: payload.rm,
    };
  }

  getClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
    };
  }

  async logout(headers: IncomingHttpHeaders): Promise<void> {
    const token = this.readCookie(headers, CUSTOMER_SESSION_COOKIE);
    const payload = token ? this.decryptSessionCookie(token) : null;

    if (!payload?.rm || !payload.sel || !payload.tok) {
      return;
    }

    await this.prisma.client.appCustomerRememberToken.updateMany({
      where: {
        customerId: payload.sub,
        selector: payload.sel,
        tokenHash: this.hashRememberToken(payload.tok),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  assertTrustedOrigin(headers: IncomingHttpHeaders): void {
    const rawOrigin = this.readFirstHeader(headers.origin);
    if (!rawOrigin) {
      return;
    }

    let origin: string;
    try {
      origin = new URL(rawOrigin).origin;
    } catch {
      throw new ForbiddenException("Untrusted customer auth origin.");
    }

    if (!this.getTrustedOrigins().has(origin)) {
      throw new ForbiddenException("Untrusted customer auth origin.");
    }
  }

  private createSessionCookie(payload: CustomerSessionPayload): string {
    const iv = randomBytes(CUSTOMER_SESSION_IV_BYTES);
    const cipher = createCipheriv(CUSTOMER_SESSION_ALGORITHM, this.sessionKey, iv);
    cipher.setAAD(CUSTOMER_SESSION_AAD);

    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      CUSTOMER_SESSION_VERSION,
      iv.toString("base64url"),
      encrypted.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  }

  private decryptSessionCookie(value: string): CustomerSessionPayload | null {
    const [version, ivPart, encryptedPart, tagPart, extraPart] = value.split(".");
    if (version !== CUSTOMER_SESSION_VERSION || !ivPart || !encryptedPart || !tagPart || extraPart) {
      return null;
    }

    try {
      const iv = Buffer.from(ivPart, "base64url");
      const encrypted = Buffer.from(encryptedPart, "base64url");
      const tag = Buffer.from(tagPart, "base64url");

      if (iv.length !== CUSTOMER_SESSION_IV_BYTES || encrypted.length === 0 || tag.length !== CUSTOMER_SESSION_TAG_BYTES) {
        return null;
      }

      const decipher = createDecipheriv(CUSTOMER_SESSION_ALGORITHM, this.sessionKey, iv);
      decipher.setAAD(CUSTOMER_SESSION_AAD);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      return this.parseSessionPayload(JSON.parse(decrypted) as unknown);
    } catch {
      return null;
    }
  }

  private parseSessionPayload(payload: unknown): CustomerSessionPayload | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const candidate = payload as Partial<CustomerSessionPayload>;
    const customerId = candidate.sub;
    const tenantId = candidate.tid;
    const expiresAt = candidate.exp;
    const remember = candidate.rm;

    if (
      candidate.v !== 1 ||
      !Number.isInteger(customerId) ||
      !Number.isInteger(tenantId) ||
      !Number.isInteger(expiresAt) ||
      typeof remember !== "boolean" ||
      customerId === undefined ||
      tenantId === undefined ||
      expiresAt === undefined ||
      customerId <= 0 ||
      tenantId <= 0 ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (remember && (typeof candidate.sel !== "string" || typeof candidate.tok !== "string")) {
      return null;
    }

    if (!remember && (candidate.sel !== undefined || candidate.tok !== undefined)) {
      return null;
    }

    return {
      v: 1,
      sub: customerId,
      tid: tenantId,
      exp: expiresAt,
      rm: remember,
      sel: candidate.sel,
      tok: candidate.tok,
    };
  }

  private getExpirationDate(remember: boolean): Date {
    const hours = remember ? this.getPositiveNumber("CUSTOMER_AUTH_REMEMBER_DAYS", 30) * 24 : this.getPositiveNumber("CUSTOMER_AUTH_SESSION_HOURS", 12);
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private getCookieOptions(expiresAt: Date, remember: boolean): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
    };

    if (remember) {
      options.expires = expiresAt;
      options.maxAge = Math.max(0, expiresAt.getTime() - Date.now());
    }

    return options;
  }

  private getTenantId(): number {
    return this.getPositiveNumber("CUSTOMER_AUTH_TENANT_ID", 1);
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined ? fallback : Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, this.normalizeLaravelBcryptHash(hash));
    } catch {
      return false;
    }
  }

  private normalizeLaravelBcryptHash(hash: string): string {
    return hash.startsWith("$2y$") ? `$2a$${hash.slice(4)}` : hash;
  }

  private createRememberToken(): RememberToken {
    return {
      selector: randomBytes(CUSTOMER_REMEMBER_TOKEN_BYTES).toString("base64url"),
      token: randomBytes(CUSTOMER_REMEMBER_TOKEN_BYTES).toString("base64url"),
    };
  }

  private hashRememberToken(token: string): string {
    return createHmac("sha256", this.secret).update("customer-remember-token").update("\0").update(token).digest("hex");
  }

  private hashOptionalHeader(header: string | string[] | undefined): string | null {
    const value = this.readFirstHeader(header);
    return value ? createHash("sha256").update(value).digest("hex") : null;
  }

  private async verifyRememberToken(payload: CustomerSessionPayload): Promise<boolean> {
    if (!payload.sel || !payload.tok) {
      return false;
    }

    const storedToken = await this.prisma.client.appCustomerRememberToken.findUnique({
      where: {
        selector: payload.sel,
      },
      select: {
        customerId: true,
        admTenantId: true,
        expiresAt: true,
        revokedAt: true,
        tokenHash: true,
      },
    });

    if (
      !storedToken ||
      storedToken.customerId !== payload.sub ||
      storedToken.admTenantId !== payload.tid ||
      storedToken.revokedAt !== null ||
      storedToken.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }

    return this.safeEqualString(storedToken.tokenHash, this.hashRememberToken(payload.tok));
  }

  private safeEqualString(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private getTrustedOrigins(): Set<string> {
    const configuredOrigins = this.config.get<string>("CUSTOMER_AUTH_TRUSTED_ORIGINS");
    const corsOrigin = this.config.get<string>("CORS_ORIGIN", "http://localhost:3000");
    const values = `${configuredOrigins ?? ""},${corsOrigin}`
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "" && value !== "*");

    return new Set(
      values.flatMap((value) => {
        try {
          return [new URL(value).origin];
        } catch {
          return [];
        }
      }),
    );
  }

  private readFirstHeader(header: string | string[] | undefined): string | null {
    if (Array.isArray(header)) {
      return header[0] ?? null;
    }

    return header ?? null;
  }

  private readCookie(headers: IncomingHttpHeaders, name: string): string | null {
    const header = Array.isArray(headers.cookie) ? headers.cookie.join(";") : headers.cookie;
    if (!header) {
      return null;
    }

    for (const part of header.split(";")) {
      const [rawKey, ...rawValue] = part.trim().split("=");
      if (rawKey === name) {
        return rawValue.join("=") || null;
      }
    }

    return null;
  }

  private toUser(customer: { id: number; email: string; name: string | null; nameFrontend: string | null; admTenantId: number }): CustomerAuthUser {
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      nameFrontend: customer.nameFrontend,
      tenantId: customer.admTenantId,
    };
  }
}
