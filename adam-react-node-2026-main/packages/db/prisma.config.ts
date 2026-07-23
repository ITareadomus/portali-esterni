import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "prisma/config";

const apiEnvFiles = [
  new URL("../../apps/api/.env", import.meta.url),
  new URL("../../apps/api/.env.local", import.meta.url),
];
const apiEnv = Object.assign(
  {},
  ...apiEnvFiles.filter((file) => existsSync(file)).map((file) => parseEnv(readFileSync(file, "utf8"))),
);

for (const [key, value] of Object.entries(apiEnv)) {
  process.env[key] ??= value;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
