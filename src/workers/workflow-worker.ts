import { randomUUID } from 'node:crypto';

import type { Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import type { PoolClient } from 'pg';

import type { Config } from '../config.js';
import { type DomainEvent, type WorkflowCommand } from '../domain/messages.js';
import { assertTransition } from '../domain/order.js';
import { decideSaga, executeDemoCommand } from '../domain/saga.js';
import type { DatabasePool } from '../infrastructure/database.js';
import { createKafka } from '../infrastructure/kafka.js';

async function claimMessage(
  client: PoolClient,
  consumerName: string,
  messageId: string,
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO processed_messages(consumer_name, message_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING message_id`,
    [consumerName, messageId],
  );
  return result.rowCount === 1;
}

async function enqueue(
  client: PoolClient,
  topic: string,
  message: DomainEvent | WorkflowCommand,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_messages(id, topic, message_key, payload, occurred_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [message.id, topic, message.aggregateId, JSON.stringify(message), message.occurredAt],
  );
}

async function processSagaEvent(pool: DatabasePool, event: DomainEvent): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await claimMessage(client, 'order-saga', event.id))) {
      await client.query('COMMIT');
      return;
    }
    const decision = decideSaga(event);
    if (decision.targetStatus !== undefined) {
      const current = await client.query<{
        status: 'PENDING' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED';
      }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [event.aggregateId]);
      const status = current.rows[0]?.status;
      if (status === undefined) throw new Error('Saga referenced an unknown order');
      if (status !== decision.targetStatus) {
        assertTransition(status, decision.targetStatus);
        await client.query(
          'UPDATE orders SET status = $1, version = version + 1, updated_at = now() WHERE id = $2',
          [decision.targetStatus, event.aggregateId],
        );
        await client.query(
          `INSERT INTO order_history(order_id, from_status, to_status, reason, message_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            event.aggregateId,
            status,
            decision.targetStatus,
            decision.reason ?? event.type,
            event.id,
          ],
        );
      }
    }
    for (const command of decision.commands) await enqueue(client, 'orders.commands', command);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processDemoCommand(pool: DatabasePool, command: WorkflowCommand): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await claimMessage(client, 'demo-fulfillment', command.id))) {
      await client.query('COMMIT');
      return;
    }
    await enqueue(client, 'orders.events', executeDemoCommand(command));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function startConsumer(
  consumer: Consumer,
  topic: string,
  handle: (value: string) => Promise<void>,
  logger: Logger,
): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message, partition, topic: messageTopic }) => {
      const value = message.value?.toString();
      if (value === undefined) return;
      try {
        await handle(value);
      } catch (error) {
        logger.error({ err: error, partition, topic: messageTopic }, 'workflow message failed');
        throw error;
      }
    },
  });
}

export async function runWorkflowWorkers(
  config: Config,
  pool: DatabasePool,
  logger: Logger,
  signal: AbortSignal,
): Promise<void> {
  const kafka = createKafka(config);
  const saga = kafka.consumer({ groupId: 'order-saga-v1' });
  const fulfillment = kafka.consumer({ groupId: 'demo-fulfillment-v1' });
  await Promise.all([
    startConsumer(
      saga,
      'orders.events',
      async (value) => processSagaEvent(pool, JSON.parse(value) as DomainEvent),
      logger,
    ),
    startConsumer(
      fulfillment,
      'orders.commands',
      async (value) => processDemoCommand(pool, JSON.parse(value) as WorkflowCommand),
      logger,
    ),
  ]);

  await new Promise<void>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
  await Promise.all([saga.disconnect(), fulfillment.disconnect()]);
  logger.info({ workerId: randomUUID() }, 'workflow consumers stopped');
}
