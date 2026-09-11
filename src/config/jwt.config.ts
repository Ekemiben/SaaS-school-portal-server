export const jwtConfig = () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'super-secret-jwt-access-key-school-saas',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-jwt-refresh-key-school-saas',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'schoolportal.io',
  },
});
