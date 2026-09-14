import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SystemPermissions } from '../common/constants/permissions.js';

@Injectable()
export class DatabaseSeederService {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedSystemPermissions(): Promise<number> {
    if (!this.prisma.isDbConnected) {
      return 0;
    }

    let seededCount = 0;
    for (const [_key, code] of Object.entries(SystemPermissions)) {
      const parts = code.split('.');
      const moduleName = parts[0] || 'general';
      const actionName = parts[1] || 'access';

      try {
        await this.prisma.permission.upsert({
          where: { name: code },
          update: {
            module: moduleName,
            description: `Allows user to ${actionName} within ${moduleName} module`,
          },
          create: {
            name: code,
            module: moduleName,
            description: `Allows user to ${actionName} within ${moduleName} module`,
          },
        });
        seededCount++;
      } catch (err: any) {
        this.logger.warn(`Failed to upsert permission ${code}: ${err?.message}`);
      }
    }

    this.logger.log(`Initialized ${seededCount} system permissions in PostgreSQL.`);
    return seededCount;
  }
}
