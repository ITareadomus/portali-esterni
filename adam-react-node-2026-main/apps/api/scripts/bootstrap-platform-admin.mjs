import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
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
      process.env[match[1].trim()] = match[2].trim();
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
      throw new Error(
        `Unexpected --${key}. Platform admin bootstrap creates only the Better Auth platform admin.`,
      );
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

const args = parseArgs(process.argv, new Set(["email", "password", "name"]));
const email = required(args, "email", "BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
const password = required(args, "password", "BOOTSTRAP_ADMIN_PASSWORD");
const name = required(args, "name", "BOOTSTRAP_ADMIN_NAME");

if (password.length < 8) {
  throw new Error("Invalid --password: Better Auth default minimum is 8 characters");
}

const prisma = createPrismaClient();

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = [baseURL, process.env.CORS_ORIGIN ?? baseURL];
const auth = betterAuth({
  appName: "ADAM",
  baseURL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [...new Set(trustedOrigins)],
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [admin()],
});

try {
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    const created = await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: "admin",
      },
    });
    user = created.user;
    console.log(`created:user:${user.id}`);
  } else if (user.role !== "admin") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "admin" },
    });
    console.log(`updated:user-role:${user.id}`);
  } else {
    console.log(`existing:user:${user.id}`);
  }

  console.log("bootstrap-platform-admin:ok");
} finally {
  await prisma.$disconnect();
}
