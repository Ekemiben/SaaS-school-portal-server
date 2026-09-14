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
    console.log(`--- Seeding complete. ${count} permissions populated. ---`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.onModuleDestroy();
  }
}

runSeed();
