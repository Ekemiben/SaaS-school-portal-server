export const queuesConfig = () => ({
  queues: {
    schema: process.env.PG_BOSS_SCHEMA || 'pgboss',
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  },
});
