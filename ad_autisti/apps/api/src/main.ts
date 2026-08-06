import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AuthService } from "./auth/auth.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const auth = app.get(AuthService);

  app.enableShutdownHooks();
  app.use("/api/auth", auth.nodeHandler);
  app.useBodyParser("json");
  app.useBodyParser("urlencoded", { extended: true });
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN", "http://localhost:3000"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const docsEnabled =
    config.get<string>("NODE_ENV") !== "production" &&
    config.get<string>("API_DOCS_ENABLED", "true") !== "false";

  if (docsEnabled) {
    const documentConfig = new DocumentBuilder()
      .setTitle("ADAM API")
      .setDescription("ADAM")
      .setVersion("0.1.0")
      .addTag("health")
      .addTag("auth")
      .addTag("customer-auth")
      .addTag("customer-activities")
      .addTag("driver-auth")
      .addTag("driver-timeline")
      .addTag("platform-context")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, documentConfig));
  }

  const port = config.get<number>("PORT", 3001);
  await app.listen(port);
}

void bootstrap();
