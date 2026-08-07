import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { createMessage, type DomainEvent } from '../domain/messages.js';
import {
  assertTransition,
  OptimisticLockError,
  type Order,
  type OrderStatus,
  type SimulationMode,
} from '../domain/order.js';
import type { DatabasePool } from './database.js';

export interface CreateOrderInput {
  customerId: string;
  amountCents: number;
  simulation: SimulationMode;
}

interface OrderRow {
  id: string;
  customer_id: string;
  amount_cents: number;
  status: OrderStatus;
  version: number;
  simulation: SimulationMode;
  created_at: Date;
  updated_at: Date;
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    status: row.status,
    version: row.version,
    simulation: row.simulation,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function insertOutbox(
  client: PoolClient,
  topic: string,
  message: DomainEvent | Record<string, unknown>,
  messageId: string,
  aggregateId: string,
  occurredAt: string,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_messages(id, topic, message_key, payload, occurred_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [messageId, topic, aggregateId, JSON.stringify(message), occurredAt],
  );
}

export class OrderRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(input: CreateOrderInput, idempotencyKey: string): Promise<Order> {
    const client = await this.pool.connect();
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [idempotencyKey]);
      const existing = await client.query<{ request_hash: string; response_json: Order }>(
        'SELECT request_hash, response_json FROM idempotency_keys WHERE key = $1',
        [idempotencyKey],
      );
      const cached = existing.rows[0];
      if (cached !== undefined) {
        if (cached.request_hash !== requestHash) {
          throw new Error('Idempotency-Key was already used for a different request');
        }
        await client.query('COMMIT');
        return cached.response_json;
      }

      const id = randomUUID();
      const inserted = await client.query<OrderRow>(
        `INSERT INTO orders(id, customer_id, amount_cents, simulation)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, input.customerId, input.amountCents, input.simulation],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw new Error('Order insert did not return a row');
      const order = mapOrder(row);
      const event = createMessage(
        'OrderCreated',
        order.id,
        { orderId: order.id, simulation: order.simulation },
        randomUUID(),
      ) as DomainEvent;
      await client.query(
        `INSERT INTO order_history(order_id, to_status, reason, message_id)
         VALUES ($1, 'PENDING', 'order created', $2)`,
        [order.id, event.id],
      );
      await insertOutbox(
        client,
        'orders.events',
        event,
        event.id,
        event.aggregateId,
        event.occurredAt,
      );
      await client.query(
        `INSERT INTO idempotency_keys(key, request_hash, response_json)
         VALUES ($1, $2, $3::jsonb)`,
        [idempotencyKey, requestHash, JSON.stringify(order)],
      );
      await client.query('COMMIT');
      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async get(id: string): Promise<Order | undefined> {
    const result = await this.pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    return result.rows[0] === undefined ? undefined : mapOrder(result.rows[0]);
  }

  public async history(id: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT from_status AS "fromStatus", to_status AS "toStatus", reason,
              message_id AS "messageId", created_at AS "createdAt"
       FROM order_history WHERE order_id = $1 ORDER BY created_at, id`,
      [id],
    );
    return result.rows;
  }

  public async transition(
    id: string,
    to: OrderStatus,
    expectedVersion: number,
    reason: string,
  ): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [
        id,
      ]);
      const current = currentResult.rows[0];
      if (current === undefined) throw new Error('Order not found');
      assertTransition(current.status, to);
      const updated = await client.query<OrderRow>(
        `UPDATE orders SET status = $1, version = version + 1, updated_at = now()
         WHERE id = $2 AND version = $3 RETURNING *`,
        [to, id, expectedVersion],
      );
      const row = updated.rows[0];
      if (row === undefined) throw new OptimisticLockError();
      const event = createMessage(
        'OrderStatusChanged',
        id,
        { orderId: id, from: current.status, to },
        randomUUID(),
      ) as DomainEvent;
      await client.query(
        `INSERT INTO order_history(order_id, from_status, to_status, reason, message_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, current.status, to, reason, event.id],
      );
      await insertOutbox(client, 'orders.events', event, event.id, id, event.occurredAt);
      await client.query('COMMIT');
      return mapOrder(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
