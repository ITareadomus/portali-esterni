import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

function createLogisticsPool(connectionString: string): Pool {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  const wantsSsl =
    sslMode === "require" ||
    sslMode === "required" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full";

  if (wantsSsl) {
    url.searchParams.delete("sslmode");
  }

  return new Pool({
    connectionString: url.toString(),
    max: 5,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

@Injectable()
export class LogisticsDbService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {
    const connectionString = this.config.get<string>("LOGISTICS_DATABASE_URL")?.trim();

    if (!connectionString) {
      throw new Error("LOGISTICS_DATABASE_URL is required for the logistics DB.");
    }

    this.pool = createLogisticsPool(connectionString);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
