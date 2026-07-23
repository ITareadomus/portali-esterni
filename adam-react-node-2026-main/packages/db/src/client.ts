import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma";

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    connectionLimit: 5,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  });

  return new PrismaClient({ adapter });
}
