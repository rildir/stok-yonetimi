import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually
try {
  const envPath = path.resolve(__dirname, '../../../.env');
  console.log('Searching for .env at:', envPath);
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        // Remove quotes if present
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val.trim();
      }
    }
    console.log('.env loaded successfully. JWT_SECRET:', process.env.JWT_SECRET ? 'PRESENT' : 'MISSING');
  } else {
    console.error('.env file does not exist at:', envPath);
  }
} catch (e) {
  console.error('Error loading .env', e);
}

async function bootstrap() {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { DbService } = await import('./db.service');

  const app = await NestFactory.createApplicationContext(AppModule);
  const { AppController } = await import('./app.controller');
  const appController = app.get(AppController);

  console.log('--- Testing AppController.getStockMovements (type = IN) ---');
  const resController = await appController.getStockMovements(
    undefined, // productId
    undefined, // page
    undefined, // limit
    undefined, // search
    undefined, // startDate
    undefined, // endDate
    'IN'       // type
  );
  console.log(`Total: ${resController.total}`);
  console.log(resController.data.map(d => ({ name: d.productName, type: d.type })));

  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
