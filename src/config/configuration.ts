import { databaseConfig } from './database.config.js';
import { jwtConfig } from './jwt.config.js';
import { queuesConfig } from './queues.config.js';
import { storageConfig } from './storage.config.js';
import { paymentConfig } from './payment.config.js';

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  ...databaseConfig(),
  ...jwtConfig(),
  ...queuesConfig(),
  ...storageConfig(),
  ...paymentConfig(),
});
