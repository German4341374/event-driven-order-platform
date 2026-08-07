import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ROLE: z.enum(['api', 'outbox', 'workflow', 'all']).default('all'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  DATABASE_URL: z.url().default('postgres://orders:local-demo-only@127.0.0.1:5432/orders'),
  KAFKA_BROKERS: z.string().min(1).default('127.0.0.1:19092'),
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(500),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(environment);
}
