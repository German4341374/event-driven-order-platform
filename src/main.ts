import { pino } from 'pino';

import { loadConfig } from './config.js';
import { createPool, migrate } from './infrastructure/database.js';
import { buildServer } from './server.js';
import { runOutboxWorker } from './workers/outbox-worker.js';
import { runWorkflowWorkers } from './workers/workflow-worker.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const pool = createPool(config);
const controller = new AbortController();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    controller.abort();
  });
}

await migrate(pool);

const tasks: Promise<unknown>[] = [];
let server: Awaited<ReturnType<typeof buildServer>> | undefined;

if (config.ROLE === 'api' || config.ROLE === 'all') {
  server = await buildServer(config, pool);
  await server.listen({ host: '0.0.0.0', port: config.PORT });
  logger.info({ port: config.PORT }, 'order API listening');
}

if (config.ROLE === 'outbox' || config.ROLE === 'all') {
  tasks.push(runOutboxWorker(config, pool, logger, controller.signal));
}

if (config.ROLE === 'workflow' || config.ROLE === 'all') {
  tasks.push(runWorkflowWorkers(config, pool, logger, controller.signal));
}

await new Promise<void>((resolve) => {
  controller.signal.addEventListener(
    'abort',
    () => {
      resolve();
    },
    { once: true },
  );
});
logger.info('shutdown started');
await server?.close();
await Promise.allSettled(tasks);
await pool.end();
logger.info('shutdown completed');
