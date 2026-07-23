import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient } from "@adam/db";
import type { PrismaClient } from "@adam/db";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
