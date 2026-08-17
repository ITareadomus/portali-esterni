import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DriverVanAccount = {
  code: string;
  vehicleId: number;
  name: string;
  /** Vehicle plate / targa (also exposed as pmsCode in API responses). */
  plate: string;
  model: string | null;
  password: string;
  /** Alias of plate — kept for call sites that still use pmsCode */
  pmsCode: string;
};

type DriverVansFile = {
  vans?: Array<{
    code?: unknown;
    vehicleId?: unknown;
    name?: unknown;
    plate?: unknown;
    pmsCode?: unknown;
    model?: unknown;
    password?: unknown;
  }>;
};

const DEFAULT_CONFIG_RELATIVE_PATH = join("config", "driver-vans.json");

export function findVanAccountByCode(
  code: string,
  accounts: DriverVanAccount[],
): DriverVanAccount | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return accounts.find((account) => account.code.toUpperCase() === normalized) ?? null;
}

export function findVanAccountByVehicleId(
  vehicleId: number,
  accounts: DriverVanAccount[],
): DriverVanAccount | null {
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return null;
  }
  return accounts.find((account) => account.vehicleId === vehicleId) ?? null;
}

/**
 * Loads vans from JSON.
 * Default file: apps/api/config/driver-vans.json
 * Optional override: DRIVER_VAN_ACCOUNTS_PATH=/absolute/or/relative/path.json
 */
export function loadDriverVanAccounts(configPath?: string): DriverVanAccount[] {
  const resolvedPath = resolveVanAccountsPath(configPath);
  if (!resolvedPath) {
    throw new Error(
      `Driver van accounts file not found. Expected ${DEFAULT_CONFIG_RELATIVE_PATH} under the API root, or set DRIVER_VAN_ACCOUNTS_PATH.`,
    );
  }

  let parsed: DriverVansFile;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as DriverVansFile;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read driver van accounts from ${resolvedPath}: ${reason}`);
  }

  const accounts = (parsed.vans ?? [])
    .map((row) => normalizeVanAccount(row))
    .filter((row): row is DriverVanAccount => row !== null);

  if (accounts.length === 0) {
    throw new Error(`No valid vans found in ${resolvedPath}.`);
  }

  return accounts;
}

function normalizeVanAccount(row: {
  code?: unknown;
  vehicleId?: unknown;
  name?: unknown;
  plate?: unknown;
  pmsCode?: unknown;
  model?: unknown;
  password?: unknown;
}): DriverVanAccount | null {
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  const vehicleId = Number(row.vehicleId);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const plateRaw =
    (typeof row.plate === "string" && row.plate.trim()) ||
    (typeof row.pmsCode === "string" && row.pmsCode.trim()) ||
    "";
  const plate = plateRaw.toUpperCase();
  const model = typeof row.model === "string" && row.model.trim() ? row.model.trim() : null;
  const password = typeof row.password === "string" ? row.password.trim() : "";

  if (!code || !Number.isInteger(vehicleId) || vehicleId <= 0 || !name || !plate || !password) {
    return null;
  }

  return {
    code,
    vehicleId,
    name,
    plate,
    model,
    password,
    pmsCode: plate,
  };
}

function resolveVanAccountsPath(configPath?: string): string | null {
  const candidates: string[] = [];

  if (configPath?.trim()) {
    candidates.push(configPath.trim());
  }

  // apps/api cwd (nest start / local scripts)
  candidates.push(join(process.cwd(), DEFAULT_CONFIG_RELATIVE_PATH));
  // dist/driver-auth → ../../config
  candidates.push(join(__dirname, "..", "..", DEFAULT_CONFIG_RELATIVE_PATH));
  // src/driver-auth (tsx / some runners) → ../../config
  candidates.push(join(__dirname, "..", "..", "..", DEFAULT_CONFIG_RELATIVE_PATH));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
