import fs from "node:fs";
import { randomBytes } from "node:crypto";
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

function parseTenantId(raw) {
  const tenantId = Number(raw);
  if (!Number.isInteger(tenantId) || tenantId < 1) {
    throw new Error(`Invalid tenant id: ${raw}`);
  }
  return tenantId;
}

function hasAdminRole(user) {
  return String(user.role ?? "")
    .split(",")
    .map((role) => role.trim())
    .includes("admin");
}

function createBetterAuthId() {
  return randomBytes(24).toString("base64url");
}

loadEnvFile(join(apiRoot, ".env"));
loadEnvFile(join(apiRoot, ".env.local"), { override: true });

const args = parseArgs(
  process.argv,
  new Set(["admin-email", "tenant-id", "organization-name", "organization-slug"]),
);
const adminEmail = required(args, "admin-email", "BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
const tenantId = parseTenantId(value(args, "tenant-id", "BOOTSTRAP_LEGACY_TENANT_ID", "1"));
const organizationName = value(
  args,
  "organization-name",
  "BOOTSTRAP_LEGACY_ORGANIZATION_NAME",
  "AD Premium",
);
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
  });

  if (!platformAdmin) {
    throw new Error(
      `Platform admin not found: ${adminEmail}. Run bootstrap:platform-admin first.`,
    );
  }

  if (!hasAdminRole(platformAdmin)) {
    throw new Error(`User ${adminEmail} is not a Better Auth admin.`);
  }

  const tenant = await prisma.admTenant.findUnique({
    where: { id: tenantId },
    include: { organization: true },
  });

  if (!tenant) {
    throw new Error(`ADAM tenant not found: ${tenantId}.`);
  }

  let organizationRecord = tenant.organization;

  if (!organizationRecord) {
    organizationRecord = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
    });
  }

  if (!organizationRecord) {
    for (let attempt = 0; attempt < 5 && !organizationRecord; attempt += 1) {
      try {
        organizationRecord = await prisma.organization.create({
          data: {
            id: createBetterAuthId(),
            name: organizationName,
            slug: organizationSlug,
            createdAt: new Date(),
          },
        });
      } catch (error) {
        if (error?.code !== "P2002") {
          throw error;
        }

        organizationRecord = await prisma.organization.findUnique({
          where: { slug: organizationSlug },
        });
      }
    }

    if (!organizationRecord) {
      throw new Error("Unable to create Better Auth organization record.");
    }

    console.log(`created:organization:${organizationRecord.id}`);
  } else if (organizationRecord.name !== organizationName) {
    organizationRecord = await prisma.organization.update({
      where: { id: organizationRecord.id },
      data: { name: organizationName },
    });
    console.log(`updated:organization-name:${organizationRecord.id}`);
  } else {
    console.log(`existing:organization:${organizationRecord.id}`);
  }

  const platformAdminMembership = await prisma.member.findFirst({
    where: {
      organizationId: organizationRecord.id,
      userId: platformAdmin.id,
    },
  });

  if (platformAdminMembership) {
    throw new Error(
      `Platform admin ${platformAdmin.id} is still a member of organization ${organizationRecord.id}. Remove this adm_member row before continuing.`,
    );
  }

  if (tenant.organizationId && tenant.organizationId !== organizationRecord.id) {
    throw new Error(
      `ADAM tenant ${tenant.id} is already linked to organization ${tenant.organizationId}.`,
    );
  }

  if (!tenant.organizationId) {
    await prisma.admTenant.update({
      where: { id: tenant.id },
      data: { organizationId: organizationRecord.id },
    });
    console.log(`linked:adm_tenant:${tenant.id}:organization:${organizationRecord.id}`);
  } else {
    console.log(`existing:adm_tenant_link:${tenant.id}:organization:${tenant.organizationId}`);
  }

  console.log("bootstrap-legacy-organization:ok");
} finally {
  await prisma.$disconnect();
}
