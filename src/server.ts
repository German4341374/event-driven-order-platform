import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import type { Config } from './config.js';
import { InvalidTransitionError, OptimisticLockError, orderStatuses } from './domain/order.js';
import type { DatabasePool } from './infrastructure/database.js';
import { OrderRepository } from './infrastructure/order-repository.js';

const createSchema = z.object({
  customerId: z.string().min(1).max(100),
  amountCents: z.number().int().positive().max(100_000_000),
  simulation: z.enum(['success', 'inventory_failure', 'payment_failure']).default('success'),
});

const transitionSchema = z.object({
  status: z.enum(orderStatuses),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
});

const idSchema = z.object({ id: z.uuid() });

export async function buildServer(config: Config, pool: DatabasePool): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 64 * 1024,
  });
  const repository = new OrderRepository(pool);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Event Driven Order Platform', version: '1.0.0' },
      tags: [{ name: 'orders' }, { name: 'health' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health/live', { schema: { tags: ['health'] } }, () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { tags: ['health'] } }, async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  app.post('/api/orders', { schema: { tags: ['orders'] } }, async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key must be at least 8 characters',
        },
      });
    }
    const input = createSchema.parse(request.body);
    const order = await repository.create(input, idempotencyKey);
    return reply.code(201).send({ data: order });
  });

  app.get('/api/orders/:id', { schema: { tags: ['orders'] } }, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const order = await repository.get(id);
    if (order === undefined) {
      return reply
        .code(404)
        .send({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
    }
    return { data: order };
  });

  app.get('/api/orders/:id/history', { schema: { tags: ['orders'] } }, async (request) => {
    const { id } = idSchema.parse(request.params);
    return { data: await repository.history(id) };
  });

  app.patch('/api/orders/:id/status', { schema: { tags: ['orders'] } }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = transitionSchema.parse(request.body);
    return {
      data: await repository.transition(id, body.status, body.expectedVersion, body.reason),
    };
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.warn({ err: error }, 'request failed');
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues,
        },
      });
    }
    if (error instanceof InvalidTransitionError || error instanceof OptimisticLockError) {
      return reply.code(409).send({ error: { code: error.name, message: error.message } });
    }
    if (error.message === 'Order not found') {
      return reply.code(404).send({ error: { code: 'ORDER_NOT_FOUND', message: error.message } });
    }
    if (error.message.startsWith('Idempotency-Key')) {
      return reply
        .code(409)
        .send({ error: { code: 'IDEMPOTENCY_CONFLICT', message: error.message } });
    }
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });

  return app;
}
