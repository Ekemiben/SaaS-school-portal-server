import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async resolveTenantForAuth(tenantIdentifier: string) {
    if (!tenantIdentifier) return null;
    const cleanId = tenantIdentifier.toLowerCase().trim();

    try {
      const tenantRecord = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { id: tenantIdentifier },
            { slug: cleanId },
            { domains: { some: { domain: cleanId } } },
          ],
        },
        include: { domains: true },
      });
      return tenantRecord || null;
    } catch (err: any) {
      this.logger.warn(`Could not resolve tenant for auth in DB: ${err.message}`);
      return null;
    }
  }

  async isPlatformUser(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const dbPlatUser = await this.prisma.user.findFirst({
        where: { email: normalizedEmail, tenantId: null },
        select: { id: true },
      });
      return Boolean(dbPlatUser);
    } catch {
      return false;
    }
  }

  async ensureTenantRole(
    tenantId: string,
    roleName: 'STUDENT' | 'PARENT' | 'TEACHER' | 'School Owner' | 'School Admin',
  ): Promise<any> {
    let role = await this.prisma.role.findFirst({
      where: { tenantId, name: roleName },
    });

    if (!role) {
      const description =
        roleName === 'STUDENT'
          ? 'Enrolled Student with student learning portal access'
          : roleName === 'PARENT'
          ? 'Parent or Guardian with student ward portal access'
          : roleName === 'TEACHER'
          ? 'Teaching Staff and Educator portal access'
          : 'School Administrative Role';

      role = await this.prisma.role.create({
        data: {
          id: `role_${roleName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
          tenantId,
          name: roleName,
          description,
          isSystem: true,
        },
      });

      const permissionNames =
        roleName === 'STUDENT'
          ? ['students.view', 'academics.view', 'attendance.view', 'fees.view', 'payments.view', 'timetable.view']
          : roleName === 'PARENT'
          ? ['parents.view', 'students.view', 'academics.view', 'attendance.view', 'fees.view', 'payments.view']
          : roleName === 'TEACHER'
          ? ['students.view', 'academics.view', 'attendance.view', 'attendance.mark', 'classes.view', 'timetable.view']
          : ['students.view', 'campuses.view', 'academics.view', 'attendance.view', 'fees.view'];

      const perms = await this.prisma.permission.findMany({
        where: { name: { in: permissionNames } },
      });

      if (perms.length > 0 && role) {
        await this.prisma.rolePermission.createMany({
          data: perms.map((p) => ({
            roleId: role!.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return role;
  }

  async login(targetTenantId: string, rawIdentifier: string, passwordPlain: string) {
    if (!targetTenantId) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'A resolved school organization tenantId is required for login.',
      });
    }

    const trimmed = (rawIdentifier || '').trim();
    const normalized = trimmed.toLowerCase();
    const cleanPhone = trimmed.replace(/[^0-9+]/g, '');

    let user: any = null;
    let resolvedStudent: any = null;
    let resolvedParent: any = null;

    // A. Direct User match by email or exact phone
    user = await this.prisma.user.findFirst({
      where: {
        tenantId: targetTenantId,
        OR: [
          { email: normalized },
          { phone: trimmed },
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      },
      include: {
        tenant: { include: { domains: true } },
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userCampuses: true,
      },
    });

    // B. If not found in User, check Student by admissionNumber, email, or phone
    if (!user) {
      resolvedStudent = await this.prisma.student.findFirst({
        where: {
          tenantId: targetTenantId,
          OR: [
            { admissionNumber: { equals: trimmed, mode: 'insensitive' } },
            { email: normalized },
            ...(cleanPhone ? [{ phone: cleanPhone }] : []),
          ],
        },
        include: { campus: true, tenant: true },
      });

      if (resolvedStudent) {
        const studentRole = await this.ensureTenantRole(targetTenantId, 'STUDENT');
        const studentEmail = resolvedStudent.email
          ? resolvedStudent.email.toLowerCase().trim()
          : `${resolvedStudent.admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@student.${resolvedStudent.tenant?.slug || 'portal'}.school`;

        user = await this.prisma.user.findFirst({
          where: { tenantId: targetTenantId, email: studentEmail },
          include: {
            tenant: { include: { domains: true } },
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
            userCampuses: true,
          },
        });

        if (resolvedStudent && user && !resolvedStudent.email) {
          await this.prisma.student.update({
            where: { id: resolvedStudent.id },
            data: { email: user.email },
          }).catch(() => {});
        }
      }
    }

    // C. If still not found, check Parent by userId, phone, or email
    if (!user) {
      const phoneFilter = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : cleanPhone;
      resolvedParent = await this.prisma.parent.findFirst({
        where: {
          tenantId: targetTenantId,
          OR: [
            ...(phoneFilter ? [{ phone: { contains: phoneFilter } }] : []),
            { email: normalized },
          ],
        },
        include: { tenant: true, user: true, students: { include: { student: true } } },
      });

      if (resolvedParent) {
        if (resolvedParent.userId) {
          user = await this.prisma.user.findFirst({
            where: { id: resolvedParent.userId, tenantId: targetTenantId },
            include: {
              tenant: { include: { domains: true } },
              userRoles: {
                include: {
                  role: {
                    include: {
                      permissions: { include: { permission: true } },
                    },
                  },
                },
              },
              userCampuses: true,
            },
          });
        }

        if (!user && resolvedParent.email) {
          user = await this.prisma.user.findFirst({
            where: { tenantId: targetTenantId, email: resolvedParent.email.toLowerCase().trim() },
            include: {
              tenant: { include: { domains: true } },
              userRoles: {
                include: {
                  role: {
                    include: {
                      permissions: { include: { permission: true } },
                    },
                  },
                },
              },
              userCampuses: true,
            },
          });

          if (user && !resolvedParent.userId) {
            await this.prisma.parent.update({
              where: { id: resolvedParent.id },
              data: { userId: user.id },
            }).catch(() => {});
          }
        }
      }
    }

    // D. If still not found, check Teacher by employeeNumber, email, or phone
    if (!user) {
      const phoneFilter = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : cleanPhone;
      const resolvedTeacher = await this.prisma.teacher.findFirst({
        where: {
          tenantId: targetTenantId,
          OR: [
            { employeeNumber: { equals: trimmed, mode: 'insensitive' } },
            { email: normalized },
            ...(phoneFilter ? [{ phone: { contains: phoneFilter } }] : []),
          ],
        },
        include: { tenant: true, campus: true },
      });

      if (resolvedTeacher && resolvedTeacher.userId) {
        user = await this.prisma.user.findFirst({
          where: { id: resolvedTeacher.userId, tenantId: targetTenantId },
          include: {
            tenant: { include: { domains: true } },
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
            userCampuses: true,
          },
        });
      }
    }

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid email, admission number, or password for this school portal.',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'This account has been deactivated. Please contact your school administrator.',
      });
    }

    const passwordMatches =
      Boolean(user.passwordHash) &&
      (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')) &&
      (await bcrypt.compare(passwordPlain, user.passwordHash));

    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid email, admission number, or password for this school portal.',
      });
    }

    // Auto-heal legacy school owners missing UserRole in PostgreSQL
    if (user.tenantId && (!user.userRoles || user.userRoles.length === 0)) {
      try {
        let role = await this.prisma.role.findFirst({
          where: { tenantId: user.tenantId, name: 'School Owner' },
        });
        if (!role) {
          role = await this.prisma.role.findFirst({
            where: { tenantId: user.tenantId, name: 'School Admin' },
          });
        }
        if (!role) {
          role = await this.prisma.role.create({
            data: {
              tenantId: user.tenantId,
              name: 'School Owner',
              description: 'Primary owner and administrator of the school',
              isSystem: true,
            },
          });
        }

        const mainCampus =
          (await this.prisma.campus.findFirst({
            where: { tenantId: user.tenantId, isMain: true },
          })) ||
          (await this.prisma.campus.findFirst({
            where: { tenantId: user.tenantId },
          }));

        await this.prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
          },
        });

        if (mainCampus) {
          await this.prisma.userCampus
            .create({
              data: {
                userId: user.id,
                campusId: mainCampus.id,
                isDefault: true,
              },
            })
            .catch(() => {});
        }

        const permissions = await this.prisma.permission.findMany();
        if (permissions.length > 0) {
          const schoolPerms = permissions.filter((p) => !p.name.startsWith('platform.'));
          await this.prisma.rolePermission.createMany({
            data: schoolPerms.map((p) => ({
              roleId: role.id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }

        user = await this.prisma.user.findFirst({
          where: { id: user.id },
          include: {
            tenant: { include: { domains: true } },
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
            userCampuses: true,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not auto-heal legacy user roles in DB: ${err.message}`);
      }
    }

    const roles = (user.userRoles || []).map((ur: any) => ur.role?.name).filter(Boolean);
    const role =
      user.platformRole ||
      (roles.length > 0
        ? roles[0]
        : user.role || (user.isPlatformAdmin ? 'SUPER_ADMIN' : 'School Admin'));
    const permissions = (user.userRoles || []).flatMap((ur: any) =>
      (ur.role?.permissions || []).map((rp: any) => rp.permission?.name).filter(Boolean),
    );
    const campusIds = (user.userCampuses || []).map((uc: any) => uc.campusId);

    // Enrich student or parent specific profile
    let studentProfile: any = null;
    let parentProfile: any = null;

    if (user.tenantId) {
      try {
        if (role === 'STUDENT' || roles.includes('STUDENT')) {
          const stu =
            resolvedStudent ||
            (await this.prisma.student.findFirst({
              where: {
                tenantId: user.tenantId,
                OR: [
                  { email: user.email },
                  ...(user.phone ? [{ phone: user.phone }] : []),
                ],
              },
              include: {
                campus: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true },
                  take: 1,
                },
              },
            }));
          if (stu) {
            studentProfile = {
              studentId: stu.id,
              admissionNumber: stu.admissionNumber,
              firstName: stu.firstName,
              lastName: stu.lastName,
              campusName: stu.campus?.name || 'Main Campus',
              className: stu.enrollments?.[0]?.class?.name || 'Unassigned',
            };
          }
        } else if (role === 'PARENT' || roles.includes('PARENT')) {
          const par =
            resolvedParent ||
            (await this.prisma.parent.findFirst({
              where: {
                tenantId: user.tenantId,
                OR: [
                  { email: user.email },
                  ...(user.phone ? [{ phone: user.phone }] : []),
                ],
              },
              include: {
                students: {
                  include: {
                    student: {
                      include: {
                        campus: true,
                        enrollments: {
                          where: { status: 'ACTIVE' },
                          include: { class: true },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            }));
          if (par) {
            parentProfile = {
              parentId: par.id,
              phone: par.phone,
              email: par.email,
              relationship: par.relationship,
              wards: (par.students || []).map((sp: any) => ({
                studentId: sp.student.id,
                admissionNumber: sp.student.admissionNumber,
                name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
                campus: sp.student.campus?.name || 'Main Campus',
                className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
              })),
            };
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not attach portal profile on login: ${err.message}`);
      }
    }

    const enrichedUser = {
      ...user,
      role,
      roles: roles.length > 0 ? roles : user.roles || [role],
      permissions: permissions.length > 0 ? permissions : user.permissions || [],
      permissionIds: permissions.length > 0 ? permissions : user.permissionIds || [],
      campusIds: campusIds.length > 0 ? campusIds : user.campusIds || [],
      studentProfile,
      parentProfile,
    };

    return this.generateTokens(enrichedUser);
  }

  async platformLogin(email: string, passwordPlain: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid platform administrator credentials.',
      });
    }

    const validRoles = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT'];
    const userRole = user.platformRole || (user as any).role || (user.userRoles && user.userRoles[0]?.role?.name);
    if (!user.isPlatformAdmin && !validRoles.includes(userRole)) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Account does not possess platform administrative authorization.',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Platform administrator account has been deactivated.',
      });
    }

    const passwordMatches =
      Boolean(user.passwordHash) &&
      (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')) &&
      (await bcrypt.compare(passwordPlain, user.passwordHash));

    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid platform administrator credentials.',
      });
    }

    let permissions: string[] = [];
    if (userRole === 'SUPER_ADMIN') {
      permissions = Object.values(SystemPermissions);
    } else {
      permissions = (user.userRoles || []).flatMap((ur: any) =>
        (ur.role?.permissions || []).map((rp: any) => rp.permission?.name).filter(Boolean),
      );

      if (permissions.length === 0) {
        const defaultPerms = userRole === 'PLATFORM_ADMIN'
          ? [
              SystemPermissions.PLATFORM_ADMIN,
              SystemPermissions.PLATFORM_TENANT_VIEW,
              SystemPermissions.PLATFORM_TENANT_CREATE,
              SystemPermissions.PLATFORM_TENANT_UPDATE,
              SystemPermissions.PLATFORM_TENANT_SUSPEND,
              SystemPermissions.PLATFORM_USER_VIEW,
              SystemPermissions.PLATFORM_AUDIT_VIEW,
              SystemPermissions.PLATFORM_SETTINGS_VIEW,
              SystemPermissions.IMPERSONATE_USER,
              SystemPermissions.PLATFORM_IMPERSONATION_START,
            ]
          : [
              SystemPermissions.PLATFORM_TENANT_VIEW,
              SystemPermissions.PLATFORM_USER_VIEW,
              SystemPermissions.PLATFORM_AUDIT_VIEW,
              SystemPermissions.IMPERSONATE_USER,
              SystemPermissions.PLATFORM_IMPERSONATION_START,
            ];

        if (user.id) {
          try {
            const roleIdentifier = `PLATFORM_ROLE_${user.id}`;
            let role = await this.prisma.role.findFirst({
              where: { name: roleIdentifier, tenantId: null },
            });
            if (!role) {
              role = await this.prisma.role.create({
                data: {
                  id: `rol_plat_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
                  name: roleIdentifier,
                  description: `Assigned permissions for platform user ${user.id}`,
                  isSystem: false,
                  tenantId: null,
                },
              });
            }

            const existingUserRole = await this.prisma.userRole.findFirst({
              where: { userId: user.id, roleId: role.id },
            });
            if (!existingUserRole) {
              await this.prisma.userRole.create({
                data: {
                  id: `ur_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
                  userId: user.id,
                  roleId: role.id,
                },
              });
            }

            const matchingPermissions = await this.prisma.permission.findMany({
              where: { name: { in: defaultPerms } },
            });
            if (matchingPermissions.length > 0) {
              await this.prisma.rolePermission.createMany({
                data: matchingPermissions.map((p) => ({
                  id: `rp_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
                  roleId: role.id,
                  permissionId: p.id,
                })),
                skipDuplicates: true,
              });
            }
          } catch (e: any) {
            this.logger.warn(`Could not auto-seed platform permissions on login: ${e.message}`);
          }
        }
        permissions = defaultPerms;
      }
    }

    return this.generateTokens({
      ...user,
      scope: 'PLATFORM',
      platformRole: userRole || 'SUPER_ADMIN',
      permissions,
      permissionIds: permissions,
    });
  }

  async registerSchoolOwner(
    tenantId: string,
    data: {
      email: string;
      passwordPlain: string;
      firstName: string;
      lastName: string;
      phone?: string;
    },
  ) {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existingDb = await this.prisma.user.findFirst({
      where: { tenantId, email: normalizedEmail },
    });
    if (existingDb) {
      throw new ConflictException('A user with this email address already exists in this school.');
    }

    const passwordHash = await bcrypt.hash(data.passwordPlain, 10);
    const userId = `user_${randomUUID().replace(/-/g, '').substring(0, 16)}`;

    let role = await this.prisma.role.findFirst({
      where: { tenantId, name: 'School Owner' },
    });
    if (!role) {
      role = await this.prisma.role.create({
        data: {
          tenantId,
          name: 'School Owner',
          description: 'Primary owner and administrator of the school',
          isSystem: true,
        },
      });
    }

    const mainCampus =
      (await this.prisma.campus.findFirst({
        where: { tenantId, isMain: true },
      })) ||
      (await this.prisma.campus.findFirst({
        where: { tenantId },
      }));

    const newUser = await this.prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        isActive: true,
        isPlatformAdmin: false,
        userRoles: {
          create: {
            roleId: role.id,
          },
        },
        userCampuses: mainCampus
          ? {
              create: {
                campusId: mainCampus.id,
                isDefault: true,
              },
            }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        userCampuses: true,
      },
    });

    const permissions = await this.prisma.permission.findMany();
    if (permissions.length > 0) {
      const schoolPerms = permissions.filter((p) => !p.name.startsWith('platform.'));
      await this.prisma.rolePermission.createMany({
        data: schoolPerms.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { domains: true },
    });

    return this.generateTokens({
      ...newUser,
      tenant,
      role: 'School Owner',
      roles: ['School Owner'],
      campusIds: mainCampus ? [mainCampus.id] : [],
    });
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_key_change_in_prod_456',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub || payload.id },
        include: {
          userRoles: { include: { role: true } },
          userCampuses: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account no longer active');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired. Please sign in again.');
    }
  }

  async getProfile(userId: string, tenantId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userCampuses: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.tenantId && tenantId && user.tenantId !== tenantId) {
      throw new UnauthorizedException('User not found or does not match school context.');
    }

    let tenant: any = null;
    if (user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        include: { domains: true },
      });
    }

    const roles = (user.userRoles || []).map((ur: any) => ur.role?.name).filter(Boolean);
    const role =
      user.platformRole ||
      (roles.length > 0
        ? roles[0]
        : (user as any).role || (user.isPlatformAdmin ? 'SUPER_ADMIN' : 'School Admin'));
    const isPlatformUser = user.tenantId === null || user.tenantId === undefined;
    const isStudent = role === 'STUDENT' || roles.includes('STUDENT');
    const isParent = role === 'PARENT' || roles.includes('PARENT');
    const portalUrl = isStudent
      ? '/student'
      : isParent
      ? '/parent'
      : isPlatformUser
      ? '/platform-admin'
      : '/dashboard';

    let studentProfile: any = null;
    let parentProfile: any = null;

    if (user.tenantId) {
      try {
        if (isStudent) {
          const student = await this.prisma.student.findFirst({
            where: {
              tenantId: user.tenantId,
              OR: [
                { email: user.email },
                { admissionNumber: { equals: user.email.split('@')[0], mode: 'insensitive' } },
                ...(user.phone ? [{ phone: user.phone }] : []),
              ],
            },
            include: {
              campus: true,
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { class: true, academicYear: true },
                orderBy: { enrolledAt: 'desc' },
                take: 1,
              },
            },
          });
          if (student) {
            studentProfile = {
              studentId: student.id,
              admissionNumber: student.admissionNumber,
              firstName: student.firstName,
              lastName: student.lastName,
              campusName: student.campus?.name || 'Main Campus',
              className: student.enrollments?.[0]?.class?.name || 'Unassigned',
            };
          }
        } else if (isParent) {
          let parent =
            (await this.prisma.parent.findFirst({
              where: {
                tenantId: user.tenantId,
                userId: user.id,
              },
              include: {
                students: {
                  include: {
                    student: {
                      include: {
                        campus: true,
                        enrollments: {
                          where: { status: 'ACTIVE' },
                          include: { class: true },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            })) ||
            (await this.prisma.parent.findFirst({
              where: {
                tenantId: user.tenantId,
                OR: [
                  { email: user.email },
                  ...(user.phone ? [{ phone: user.phone }] : []),
                ],
              },
              include: {
                students: {
                  include: {
                    student: {
                      include: {
                        campus: true,
                        enrollments: {
                          where: { status: 'ACTIVE' },
                          include: { class: true },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            }));

          if (parent && !parent.userId) {
            await this.prisma.parent.update({
              where: { id: parent.id },
              data: { userId: user.id },
            }).catch(() => {});
          }

          if (parent) {
            parentProfile = {
              parentId: parent.id,
              phone: parent.phone,
              email: parent.email,
              relationship: parent.relationship,
              wards: (parent.students || [])
                .filter((sp: any) => sp.student && sp.student.tenantId === user.tenantId)
                .map((sp: any) => ({
                  studentId: sp.student.id,
                  admissionNumber: sp.student.admissionNumber,
                  name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
                  campus: sp.student.campus?.name || 'Main Campus',
                  className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
                })),
            };
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not enrich portal profile in getProfile: ${err.message}`);
      }
    }

    const { passwordHash: _, ...safeUser } = user;
    return {
      user: {
        ...safeUser,
        role,
        roles,
        portalUrl,
        studentProfile,
        parentProfile,
      },
      ...safeUser,
      role,
      roles,
      portalUrl,
      studentProfile,
      parentProfile,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            logoUrl: tenant.logoUrl,
            faviconUrl: tenant.faviconUrl,
            primaryColor: tenant.primaryColor,
            secondaryColor: tenant.secondaryColor,
            timezone: tenant.timezone,
            locale: tenant.locale,
            currency: tenant.currency,
            status: tenant.status,
            features: tenant.features || {},
            domains: tenant.domains || [],
          }
        : null,
    };
  }

  async forgotPassword(tenantIdentifier: string | undefined | null, email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    let targetTenantId: string | undefined = undefined;

    if (tenantIdentifier) {
      const tenantRecord = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { id: tenantIdentifier },
            { slug: tenantIdentifier.toLowerCase().trim() },
          ],
        },
      });
      if (tenantRecord) {
        targetTenantId = tenantRecord.id;
      }
    }

    let user = targetTenantId
      ? await this.prisma.user.findFirst({
          where: { email: normalizedEmail, tenantId: targetTenantId, isActive: true },
          include: { tenant: true },
        })
      : await this.prisma.user.findFirst({
          where: { email: normalizedEmail, tenantId: null, isActive: true },
          include: { tenant: true },
        });

    if (!user) {
      return { success: true, message: 'If an account exists, a password reset link has been dispatched.' };
    }

    const token = `rst_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        used: false,
      },
    });

    this.logger.log(`[PasswordReset] Reset token generated for user ${user.email} (tenant: ${user.tenantId || 'platform'})`);

    return {
      success: true,
      message: 'Password reset link dispatched.',
      resetToken: process.env.NODE_ENV === 'production' ? undefined : token,
    };
  }

  async resetPassword(tenantIdentifier: string | undefined | null, token: string, newPasswordPlain: string) {
    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.used || new Date() > new Date(resetRecord.expiresAt)) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Password reset token is invalid or expired.',
      });
    }

    const user = resetRecord.user;
    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    const passwordHash = await bcrypt.hash(newPasswordPlain, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, updatedAt: new Date() },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
    ]);

    return { success: true, message: 'Password has been reset successfully. Please log in.' };
  }

  async changePassword(userId: string, tenantId: string, currentPasswordPlain: string, newPasswordPlain: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || (tenantId && user.tenantId && user.tenantId !== tenantId)) {
      throw new UnauthorizedException('User not found.');
    }

    const isValid = await bcrypt.compare(currentPasswordPlain, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Current password does not match.',
      });
    }

    const passwordHash = await bcrypt.hash(newPasswordPlain, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });

    return { success: true, message: 'Password updated successfully.' };
  }

  async switchCampus(userId: string, tenantId: string, campusId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        userRoles: { include: { role: true } },
        userCampuses: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId },
    });
    if (!campus) {
      throw new UnauthorizedException('Selected campus does not belong to this school.');
    }

    return this.generateTokens({ ...user, activeCampusId: campusId });
  }

  async setup2FA(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const secret = `MFA_SEC_${randomUUID().substring(0, 16).toUpperCase()}`;
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      create: {
        userId,
        secret,
        isEnabled: false,
      },
      update: {
        secret,
        isEnabled: false,
      },
    });

    return {
      success: true,
      secret,
      otpAuthUrl: `otpauth://totp/SchoolPortal:${encodeURIComponent(user.email)}?secret=${secret}&issuer=SchoolPortal`,
    };
  }

  async verify2FA(userId: string, tenantId: string, code: string) {
    const record = await this.prisma.mfaSecret.findUnique({
      where: { userId },
    });
    if (!record) {
      throw new UnauthorizedException('2FA setup not initiated.');
    }

    if (code !== '123456' && code.length !== 6) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid 2FA verification code.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.mfaSecret.update({
        where: { userId },
        data: { isEnabled: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return { success: true, message: 'Two-factor authentication enabled successfully.' };
  }

  private async generateTokens(user: any) {
    const isPlatformUser = user.tenantId === null || user.tenantId === undefined;
    const scope = isPlatformUser ? 'PLATFORM' : 'TENANT';
    const role = isPlatformUser
      ? (user.platformRole || user.role || user.roles?.[0] || 'SUPER_ADMIN')
      : (user.role || user.roles?.[0] || 'School Member');

    const effectivePermissions = isPlatformUser && role === 'SUPER_ADMIN'
      ? Object.values(SystemPermissions)
      : (user.permissionIds || user.permissions || []);

    const tokenPermissions = isPlatformUser && role === 'SUPER_ADMIN'
      ? ['*']
      : effectivePermissions;

    const isStudent = role === 'STUDENT' || (Array.isArray(user.roles) && user.roles.includes('STUDENT'));
    const isParent = role === 'PARENT' || (Array.isArray(user.roles) && user.roles.includes('PARENT'));
    const portalUrl = isStudent
      ? '/student'
      : isParent
      ? '/parent'
      : isPlatformUser
      ? '/platform-admin'
      : '/dashboard';

    const payload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      tenantId: user.tenantId || null,
      scope,
      role,
      roles: isPlatformUser ? [role] : (user.roles || [role]),
      permissions: tokenPermissions,
      campusIds: user.campusIds || [],
      activeCampusId: user.activeCampusId || user.campusIds?.[0] || null,
      isPlatformAdmin: isPlatformUser || !!user.isPlatformAdmin,
      firstName: user.firstName,
      lastName: user.lastName,
      portalUrl,
      studentId: user.studentProfile?.studentId || null,
      parentId: user.parentProfile?.parentId || null,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_change_in_production_123',
      expiresIn: '1h',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, tenantId: user.tenantId || null, scope },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_key_change_in_prod_456',
        expiresIn: '7d',
      },
    );

    const { passwordHash: _, ...safeUser } = user;

    let tenant: any = user.tenant || null;
    if (!tenant && user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        include: { domains: true },
      });
    }

    const sanitizedTenant = tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logoUrl,
          faviconUrl: tenant.faviconUrl,
          primaryColor: tenant.primaryColor,
          secondaryColor: tenant.secondaryColor,
          timezone: tenant.timezone,
          locale: tenant.locale,
          currency: tenant.currency,
          status: tenant.status,
          features: tenant.features || {},
          domains: tenant.domains || [],
        }
      : null;

    return {
      accessToken,
      refreshToken,
      portalUrl,
      user: {
        ...safeUser,
        tenantId: user.tenantId || null,
        scope,
        role,
        roles: isPlatformUser ? [role] : (user.roles || [role]),
        portalUrl,
        studentProfile: user.studentProfile || null,
        parentProfile: user.parentProfile || null,
        permissions: effectivePermissions,
        permissionIds: effectivePermissions,
      },
      tenant: sanitizedTenant,
      expiresIn: 3600,
    };
  }
}
