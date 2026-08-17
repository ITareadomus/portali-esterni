import type { IncomingHttpHeaders } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DRIVER_SESSION_COOKIE_NAME,
  type DriverAuthLoginResponse,
  type DriverAuthMeResponse,
  type DriverAuthUser,
  type DriverAuthVehicle,
} from "@adam/types";
import { PrismaService } from "../prisma/prisma.service";
import type { DriverLoginDto } from "./dto/driver-login.dto";
import {
  findVanAccountByCode,
  findVanAccountByVehicleId,
  loadDriverVanAccounts,
  type DriverVanAccount,
} from "./driver-van.accounts";
import { DriverVehicleAssignmentService } from "./driver-vehicle-assignment.service";

export const DRIVER_SESSION_COOKIE = DRIVER_SESSION_COOKIE_NAME;

export type DriverAuthSession = {
  driverId: number;
  vehicleId: number | null;
  vanCode: string | null;
  expiresAt: Date;
  remember: boolean;
};

type DriverSessionPayloadV1 = {
  v: 1;
  sub: number;
  exp: number;
  rm: boolean;
};

type DriverSessionPayloadV2 = {
  v: 2;
  sub: number;
  vid: number;
  vc: string;
  exp: number;
  rm: boolean;
};

type DriverSessionPayload = DriverSessionPayloadV1 | DriverSessionPayloadV2;

type CookieOptions = {
  expires?: Date;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
};

type DriverAppUserRow = {
  id: number;
  name: string | null;
  lastname: string | null;
  email: string | null;
  mobile: string | null;
};

const LOCAL_DEV_SECRET = "local-dev-driver-auth-secret-change-me";
const DRIVER_SESSION_VERSION = "v1";
const DRIVER_SESSION_ALGORITHM = "aes-256-gcm";
const DRIVER_SESSION_AAD = Buffer.from("adam.driver-session.v1", "utf8");
const DRIVER_SESSION_IV_BYTES = 12;
const DRIVER_SESSION_TAG_BYTES = 16;
const DRIVER_AUTH_MIN_PRODUCTION_SECRET_LENGTH = 32;
const DEFAULT_DRIVER_ROLE_ID = 9;
const INVALID_USER_MESSAGE = "Lo user non è corretto.";
const ROME_TIME_ZONE = "Europe/Rome";

@Injectable()
export class DriverAuthService {
  private readonly secret: string;
  private readonly sessionKey: Buffer;
  private readonly driverRoleId: number;
  private readonly vanAccounts: DriverVanAccount[];

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(DriverVehicleAssignmentService)
    private readonly vehicleAssignments: DriverVehicleAssignmentService,
  ) {
    const driverSecret = this.config.get<string>("DRIVER_AUTH_SECRET")?.trim();
    const isProduction = this.config.get<string>("NODE_ENV") === "production";

    if (!driverSecret && isProduction) {
      throw new Error("DRIVER_AUTH_SECRET is required in production.");
    }

    if (driverSecret && isProduction && driverSecret.length < DRIVER_AUTH_MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(`DRIVER_AUTH_SECRET must be at least ${DRIVER_AUTH_MIN_PRODUCTION_SECRET_LENGTH} characters in production.`);
    }

    this.secret = driverSecret && driverSecret !== "" ? driverSecret : LOCAL_DEV_SECRET;
    this.sessionKey = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(this.secret, "utf8"),
        Buffer.from("adam.driver-auth", "utf8"),
        Buffer.from("session-cookie-encryption", "utf8"),
        32,
      ),
    );
    this.driverRoleId = this.getPositiveNumber("DRIVER_AUTH_ROLE_ID", DEFAULT_DRIVER_ROLE_ID);
    this.vanAccounts = loadDriverVanAccounts(this.config.get<string>("DRIVER_VAN_ACCOUNTS_PATH"));
  }

  async login(dto: DriverLoginDto): Promise<{
    response: DriverAuthLoginResponse;
    cookieValue: string;
    cookieOptions: CookieOptions;
  }> {
    const identifier = (dto.code ?? dto.email ?? "").trim();
    const van = findVanAccountByCode(identifier, this.vanAccounts);

    if (van) {
      return this.loginWithVan(van, dto.password, dto.remember === true);
    }

    return this.loginWithLegacyEmail(identifier, dto.password, dto.remember === true);
  }

  async me(session: DriverAuthSession): Promise<DriverAuthMeResponse> {
    if (session.vehicleId && session.vanCode) {
      const van =
        findVanAccountByCode(session.vanCode, this.vanAccounts) ??
        findVanAccountByVehicleId(session.vehicleId, this.vanAccounts);
      if (!van) {
        throw new UnauthorizedException("Driver session is no longer valid.");
      }

      if (session.driverId > 0) {
        const driver = await this.findActiveDriverById(session.driverId);
        return {
          authenticated: true,
          user: this.resolveVanUser(driver ? driver.id : 0, van),
        };
      }

      return {
        authenticated: true,
        user: this.resolveVanUser(0, van),
      };
    }

    const driver = await this.findActiveDriverById(session.driverId);
    if (!driver) {
      throw new UnauthorizedException("Driver session is no longer valid.");
    }

    return {
      authenticated: true,
      user: this.resolveDriverUser(driver),
    };
  }

  async readSessionFromHeaders(headers: IncomingHttpHeaders): Promise<DriverAuthSession | null> {
    const token = this.readCookie(headers, DRIVER_SESSION_COOKIE);
    if (!token) {
      return null;
    }

    const payload = this.decryptSessionCookie(token);
    if (!payload) {
      return null;
    }

    if (payload.v === 2) {
      return {
        driverId: payload.sub,
        vehicleId: payload.vid,
        vanCode: payload.vc,
        expiresAt: new Date(payload.exp * 1000),
        remember: payload.rm,
      };
    }

    return {
      driverId: payload.sub,
      vehicleId: null,
      vanCode: null,
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

  async logout(): Promise<void> {
    return;
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
      throw new ForbiddenException("Untrusted driver auth origin.");
    }

    if (!this.getTrustedOrigins().has(origin)) {
      throw new ForbiddenException("Untrusted driver auth origin.");
    }
  }

  getVanAccountByVehicleId(vehicleId: number): DriverVanAccount | null {
    return findVanAccountByVehicleId(vehicleId, this.vanAccounts);
  }

  private async loginWithVan(
    van: DriverVanAccount,
    password: string,
    remember: boolean,
  ): Promise<{
    response: DriverAuthLoginResponse;
    cookieValue: string;
    cookieOptions: CookieOptions;
  }> {
    if (!this.verifyPlainPassword(password, van.password)) {
      throw new UnauthorizedException(INVALID_USER_MESSAGE);
    }

    const todayYmd = getTodayInRomeYmd();
    const assignedDriverId = await this.vehicleAssignments.resolveDriverIdForVehicle(
      van.vehicleId,
      todayYmd,
    );
    const driver =
      assignedDriverId && assignedDriverId > 0 ? await this.findActiveDriverById(assignedDriverId) : null;
    const driverId = driver?.id ?? 0;
    const user = this.resolveVanUser(driverId, van);
    const expiresAt = this.getExpirationDate(remember);

    return {
      response: {
        ok: true,
        user,
      },
      cookieValue: this.createSessionCookie({
        v: 2,
        sub: driverId,
        vid: van.vehicleId,
        vc: van.code,
        exp: Math.floor(expiresAt.getTime() / 1000),
        rm: remember,
      }),
      cookieOptions: this.getCookieOptions(expiresAt, remember),
    };
  }

  private async loginWithLegacyEmail(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<{
    response: DriverAuthLoginResponse;
    cookieValue: string;
    cookieOptions: CookieOptions;
  }> {
    const driver = await this.findActiveDriverByEmail(email);

    if (!driver || !this.verifyPlainPassword(password, driver.mobile ?? "")) {
      throw new UnauthorizedException(INVALID_USER_MESSAGE);
    }

    const user = this.resolveDriverUser(driver);
    const expiresAt = this.getExpirationDate(remember);

    return {
      response: {
        ok: true,
        user,
      },
      cookieValue: this.createSessionCookie({
        v: 1,
        sub: user.id,
        exp: Math.floor(expiresAt.getTime() / 1000),
        rm: remember,
      }),
      cookieOptions: this.getCookieOptions(expiresAt, remember),
    };
  }

  private async findActiveDriverByEmail(email: string): Promise<DriverAppUserRow | null> {
    if (!email.includes("@")) {
      return null;
    }

    const rows = await this.prisma.client.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, lastname, email, mobile
      FROM app_users
      WHERE LOWER(email) = LOWER(${email})
        AND user_role_id = ${this.driverRoleId}
        AND active = 1
      LIMIT 1
    `;

    return this.mapDriverRow(rows[0]);
  }

  private async findActiveDriverById(id: number): Promise<DriverAppUserRow | null> {
    const rows = await this.prisma.client.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, lastname, email, mobile
      FROM app_users
      WHERE id = ${id}
        AND user_role_id = ${this.driverRoleId}
        AND active = 1
      LIMIT 1
    `;

    return this.mapDriverRow(rows[0]);
  }

  private mapDriverRow(row: Record<string, unknown> | undefined): DriverAppUserRow | null {
    if (!row) {
      return null;
    }

    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    return {
      id,
      name: typeof row.name === "string" ? row.name : null,
      lastname: typeof row.lastname === "string" ? row.lastname : null,
      email: typeof row.email === "string" ? row.email : null,
      mobile: row.mobile == null ? null : String(row.mobile),
    };
  }

  private resolveVanUser(driverId: number, van: DriverVanAccount): DriverAuthUser {
    return {
      id: driverId,
      name: van.code,
      lastname: null,
      vehicle: toAuthVehicle(van),
    };
  }

  private resolveDriverUser(driver: DriverAppUserRow): DriverAuthUser {
    const name = driver.name?.trim() || null;
    const lastname = driver.lastname?.trim() || null;

    if (!name && !lastname) {
      throw new UnauthorizedException("Nome e cognome autista mancanti in app_users.");
    }

    return {
      id: driver.id,
      name,
      lastname,
      vehicle: null,
    };
  }

  private verifyPlainPassword(password: string, expectedRaw: string): boolean {
    const expected = expectedRaw.trim();
    const provided = password.trim();
    if (!expected || provided.length === 0) {
      return false;
    }

    const left = createHash("sha256").update(provided, "utf8").digest();
    const right = createHash("sha256").update(expected, "utf8").digest();
    return timingSafeEqual(left, right);
  }

  private createSessionCookie(payload: DriverSessionPayload): string {
    const iv = randomBytes(DRIVER_SESSION_IV_BYTES);
    const cipher = createCipheriv(DRIVER_SESSION_ALGORITHM, this.sessionKey, iv);
    cipher.setAAD(DRIVER_SESSION_AAD);

    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      DRIVER_SESSION_VERSION,
      iv.toString("base64url"),
      encrypted.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  }

  private decryptSessionCookie(value: string): DriverSessionPayload | null {
    const [version, ivPart, encryptedPart, tagPart, extraPart] = value.split(".");
    if (version !== DRIVER_SESSION_VERSION || !ivPart || !encryptedPart || !tagPart || extraPart) {
      return null;
    }

    try {
      const iv = Buffer.from(ivPart, "base64url");
      const encrypted = Buffer.from(encryptedPart, "base64url");
      const tag = Buffer.from(tagPart, "base64url");

      if (iv.length !== DRIVER_SESSION_IV_BYTES || encrypted.length === 0 || tag.length !== DRIVER_SESSION_TAG_BYTES) {
        return null;
      }

      const decipher = createDecipheriv(DRIVER_SESSION_ALGORITHM, this.sessionKey, iv);
      decipher.setAAD(DRIVER_SESSION_AAD);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      return this.parseSessionPayload(JSON.parse(decrypted) as unknown);
    } catch {
      return null;
    }
  }

  private parseSessionPayload(payload: unknown): DriverSessionPayload | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const candidate = payload as {
      v?: unknown;
      sub?: unknown;
      exp?: unknown;
      rm?: unknown;
      vid?: unknown;
      vc?: unknown;
    };

    const driverId = candidate.sub;
    const expiresAt = candidate.exp;
    const remember = candidate.rm;

    if (
      !Number.isInteger(driverId) ||
      !Number.isInteger(expiresAt) ||
      typeof remember !== "boolean" ||
      typeof driverId !== "number" ||
      typeof expiresAt !== "number" ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (candidate.v === 2) {
      const vehicleId = candidate.vid;
      const vanCode = typeof candidate.vc === "string" ? candidate.vc.trim().toUpperCase() : "";
      if (
        driverId < 0 ||
        !Number.isInteger(vehicleId) ||
        typeof vehicleId !== "number" ||
        vehicleId <= 0 ||
        !vanCode
      ) {
        return null;
      }

      return {
        v: 2,
        sub: driverId,
        vid: vehicleId,
        vc: vanCode,
        exp: expiresAt,
        rm: remember,
      };
    }

    if (candidate.v !== 1 || driverId <= 0) {
      return null;
    }

    return {
      v: 1,
      sub: driverId,
      exp: expiresAt,
      rm: remember,
    };
  }

  private getExpirationDate(remember: boolean): Date {
    const hours = remember
      ? this.getPositiveNumber("DRIVER_AUTH_REMEMBER_DAYS", 30) * 24
      : this.getPositiveNumber("DRIVER_AUTH_SESSION_HOURS", 12);
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

  private getPositiveNumber(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined ? fallback : Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private getTrustedOrigins(): Set<string> {
    const configuredOrigins = this.config.get<string>("DRIVER_AUTH_TRUSTED_ORIGINS");
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
}

function toAuthVehicle(van: DriverVanAccount): DriverAuthVehicle {
  return {
    id: van.vehicleId,
    code: van.code,
    name: van.name,
    pmsCode: van.plate,
  };
}

function getTodayInRomeYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
