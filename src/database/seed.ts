import 'dotenv/config';
import { PrismaService } from './prisma.service.js';
import { DatabaseSeederService } from './seeder.service.js';

async function runSeed() {
  console.log('--- Initializing Database Seeding ---');
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const seeder = new DatabaseSeederService(prisma);
    const count = await seeder.seedSystemPermissions();
    console.log(`--- System permissions synced: ${count} ---`);

    const shouldSeedDemo = process.env.SEED_DEMO_TENANT === 'true' || process.env.SEED_DEMO === 'true';
    if (shouldSeedDemo) {
      console.log('SEED_DEMO_TENANT is enabled. Seeding isolated Greenfield demo tenant...');
      const demoResult = await seeder.seedDemoTenant();
      console.log(`--- Demo seeding result: ${demoResult.message} ---`);
    } else {
      console.log('Skipping demo tenant seeding (set SEED_DEMO_TENANT=true to seed Greenfield demo data).');
    }
    console.log('--- Database seeding complete. ---');

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.onModuleDestroy();
  }
}

runSeed();
