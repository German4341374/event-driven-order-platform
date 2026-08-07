import { describe, expect, it } from 'vitest';

import {
  assertTransition,
  InvalidTransitionError,
  OptimisticLockError,
  transitionOrder,
  type Order,
} from '../src/domain/order.js';

const baseOrder: Order = {
  id: 'b85c917a-96c2-4ca1-88d7-8f04f6905f63',
  customerId: 'customer-1',
  amountCents: 1250,
  status: 'PENDING',
  version: 0,
  simulation: 'success',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('order state machine', () => {
  it('allows pending to reserved', () => {
    expect(() => {
      assertTransition('PENDING', 'RESERVED');
    }).not.toThrow();
  });

  it('allows pending to cancelled', () => {
    expect(() => {
      assertTransition('PENDING', 'CANCELLED');
    }).not.toThrow();
  });

  it('allows reserved to confirmed', () => {
    expect(() => {
      assertTransition('RESERVED', 'CONFIRMED');
    }).not.toThrow();
  });

  it('allows reserved to cancelled', () => {
    expect(() => {
      assertTransition('RESERVED', 'CANCELLED');
    }).not.toThrow();
  });

  it('rejects confirmed to pending', () => {
    expect(() => {
      assertTransition('CONFIRMED', 'PENDING');
    }).toThrow(InvalidTransitionError);
  });

  it('rejects cancelled to reserved', () => {
    expect(() => {
      assertTransition('CANCELLED', 'RESERVED');
    }).toThrow(InvalidTransitionError);
  });

  it('increments the aggregate version', () => {
    const changed = transitionOrder(baseOrder, 'RESERVED', 0);
    expect(changed).toMatchObject({ status: 'RESERVED', version: 1 });
  });

  it('rejects a stale expected version', () => {
    expect(() => transitionOrder(baseOrder, 'RESERVED', 3)).toThrow(OptimisticLockError);
  });
});
