import { Injectable } from '@nestjs/common';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class PermissionsService {
  getAllPermissions() {
    const permissions = Object.entries(SystemPermissions).map(([key, value]) => {
      const [module, action] = value.split('.');
      return {
        key,
        code: value,
        module,
        action,
        description: `Allows user to ${action} within ${module} module`,
      };
    });

    // Group by module
    const grouped = permissions.reduce((acc: Record<string, typeof permissions>, p) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {});

    return {
      total: permissions.length,
      permissions,
      grouped,
    };
  }
}
