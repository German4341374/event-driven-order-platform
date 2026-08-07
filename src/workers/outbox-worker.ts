import type { Producer } from 'kafkajs';
import type { Logger } from 'pino';

import type { Config } from '../config.js';
import type { DatabasePool } from '../infrastructure/database.js';
import { connectProducer } from '../infrastructure/kafka.js';

interface OutboxRow {
  id: string;
  topic: string;
  message_key: string;
  payload: Record<string, unknown>;
}

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function publishOne(
  pool: DatabasePool,
  producer: Producer,
  logger: Logger,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<OutboxRow>(
      `SELECT id, topic, message_key, payload
       FROM outbox_messages
       WHERE published_at IS NULL AND dead_lettered_at IS NULL
       ORDER BY occurred_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    const row = result.rows[0];
    if (row === undefined) {
      await client.query('COMMIT');
      return false;
    }

    try {
      await producer.send({
        topic: row.topic,
        messages: [{ key: row.message_key, value: JSON.stringify(row.payload) }],
      });
      await client.query('UPDATE outbox_messages SET published_at = now() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      logger.debug({ messageId: row.id, topic: row.topic }, 'outbox message published');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown publish error';
      await client.query(
        `UPDATE outbox_messages
         SET attempts = attempts + 1,
             last_error = $2,
             dead_lettered_at = CASE WHEN attempts + 1 >= 10 THEN now() ELSE NULL END
         WHERE id = $1`,
        [row.id, message.slice(0, 1_000)],
      );
      await client.query('COMMIT');
      logger.error({ err: error, messageId: row.id }, 'outbox publish failed');
      return true;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runOutboxWorker(
  config: Config,
  pool: DatabasePool,
  logger: Logger,
  signal: AbortSignal,
): Promise<void> {
  const producer = await connectProducer(config);
  try {
    while (!signal.aborted) {
      const published = await publishOne(pool, producer, logger);
      if (!published) await sleep(config.OUTBOX_POLL_MS);
    }
  } finally {
    await producer.disconnect();
  }
}
