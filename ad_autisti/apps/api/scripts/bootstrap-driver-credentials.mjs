import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(currentDir, "..");
const sqlPath = join(apiRoot, "../../packages/db/sql/20260723_create_lg_driver_credentials.sql");

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)\s*$/);
    if (match && (override || process.env[match[1].trim()] === undefined)) {
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1].trim()] = value;
    }
  }
}

function parseArgs(argv, allowedKeys) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected --${key}.`);
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }

  return args;
}

function required(args, key, envKey) {
  const value = args[key] ?? process.env[envKey];
  if (!value) {
    throw new Error(`Missing --${key} or ${envKey}`);
  }
  return value;
}

loadEnvFile(join(apiRoot, ".env"));
loadEnvFile(join(apiRoot, ".env.local"), { override: true });

const args = parseArgs(process.argv, new Set(["driver-id", "password"]));
const driverId = Number(required(args, "driver-id", "BOOTSTRAP_DRIVER_ID"));
const password = required(args, "password", "BOOTSTRAP_DRIVER_PASSWORD");

if (!Number.isInteger(driverId) || driverId <= 0) {
  throw new Error("Invalid --driver-id: must be a positive integer");
}

if (password.length < 8) {
  throw new Error("Invalid --password: minimum is 8 characters");
}

const connectionString = process.env.LOGISTICS_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing LOGISTICS_DATABASE_URL or DATABASE_URL");
}

function createPool(rawConnectionString) {
  const url = new URL(rawConnectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  const wantsSsl =
    sslMode === "require" ||
    sslMode === "required" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full";

  if (wantsSsl) {
    url.searchParams.delete("sslmode");
  }

  return new pg.Pool({
    connectionString: url.toString(),
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

const pool = createPool(connectionString);

const createTableSql = fs.readFileSync(sqlPath, "utf8");
const passwordHash = await bcrypt.hash(password, 10);

try {
  await pool.query(createTableSql);
  await pool.query(
    `INSERT INTO lg_driver_credentials (driver_id, password_hash, active, updated_at)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (driver_id)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, active = TRUE, updated_at = NOW()`,
    [driverId, passwordHash],
  );
  console.log(`Bootstrapped driver credentials for driver_id=${driverId}`);
} finally {
  await pool.end();
}
