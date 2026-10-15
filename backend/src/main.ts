import * as fs from 'fs';
import * as path from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

// Manual env loader to support running directly without NX
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
  }
}
loadEnv();

import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { assertSecurityConfig } from './app/shared/security/security-config';
import { TenantContext } from './app/shared/tenant/tenant-context.service';
import { validationExceptionFactory } from './app/shared/i18n/i18n-exception.filter';

async function bootstrap() {
  // Fail fast on insecure production configuration (e.g. missing JWT_SECRET).
  assertSecurityConfig();
  // rawBody: integrator status callbacks are verified with an HMAC over the exact request body (WP5).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Stock adjustment attachments are sent as base64 JSON (max 5 MB file).
  app.useBodyParser('json', { limit: '8mb' });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Versioned public API alias: /api/v1/<route> == /api/<route>
  app.use((req: any, _res: unknown, next: () => void) => {
    if (typeof req.url === 'string' && req.url.startsWith('/api/v1/')) req.url = '/api/' + req.url.slice(8);
    next();
  });

  // Per-request tenant context (filled by AuthGuard, read by services)
  app.use(TenantContext.middleware);

  // Helmet HTTP security headers. WP7: CSP on API responses too - JSON, the printable legal pages
  // (inline styles, data: images / QR codes, no scripts) and Swagger UI (inline bootstrap script).
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  });

  // Enforce DTO validation rules globally
  app.useGlobalPipes(new ValidationPipe({ 
    whitelist: true, 
    transform: true,
    exceptionFactory: validationExceptionFactory,
  }));

  // Swagger Documentation Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Inventory Panel API')
    .setDescription('Akıllı Stok Yönetimi ve Sipariş Takip Sistemi API Dokümantasyonu')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT authorization token',
    })
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'Company API key (sk_live_...). Also accepted as "Authorization: Bearer sk_...". Scopes: read/write per resource. Rate limit per key: API_KEY_RATE_LIMIT req/min (default 120). Routes are also served under /api/v1/.' },
      'api-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(
    `📚 Swagger API Docs available at: http://localhost:${port}/${globalPrefix}/docs`,
  );
}

bootstrap();

