import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "@adam/db";

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(currentDir, "..");

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)\s*$/);
    if (match && (override || process.env[match[1].trim()] === undefined)) {
      process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, "$1");
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

function value(args, key, envKey, fallback) {
  return args[key] ?? process.env[envKey] ?? fallback;
}

function required(args, key, envKey) {
  const found = value(args, key, envKey);
  if (!found) {
    throw new Error(`Missing --${key} or ${envKey}`);
  }
  return found;
}

loadEnvFile(join(apiRoot, ".env"));
loadEnvFile(join(apiRoot, ".env.local"), { override: true });

const args = parseArgs(process.argv, new Set(["admin-email", "organization-slug"]));
const adminEmail = required(args, "admin-email", "BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
const organizationSlug = value(
  args,
  "organization-slug",
  "BOOTSTRAP_LEGACY_ORGANIZATION_SLUG",
  "adam-legacy",
);

const prisma = createPrismaClient();

try {
  const platformAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true },
  });

  if (!platformAdmin) {
    throw new Error(`Platform admin not found: ${adminEmail}.`);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, slug: true },
  });

  if (!organization) {
    throw new Error(`Organization not found: ${organizationSlug}.`);
  }

  const result = await prisma.member.deleteMany({
    where: {
      userId: platformAdmin.id,
      organizationId: organization.id,
    },
  });

  console.log(`deleted:adm_member:${result.count}`);
  console.log("unbind-platform-admin-organization:ok");
} finally {
  await prisma.$disconnect();
}
