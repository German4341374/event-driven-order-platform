export const orderStatuses = ['PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED'] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export interface Order {
  id: string;
  customerId: string;
  amountCents: number;
  status: OrderStatus;
  version: number;
  simulation: SimulationMode;
  createdAt: string;
  updatedAt: string;
}

export type SimulationMode = 'success' | 'inventory_failure' | 'payment_failure';

const allowedTransitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['RESERVED', 'CANCELLED'],
  RESERVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  public constructor(from: OrderStatus, to: OrderStatus) {
    super(`Order cannot transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class OptimisticLockError extends Error {
  public constructor() {
    super('The order changed after it was read; refresh it and retry');
    this.name = 'OptimisticLockError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function transitionOrder(order: Order, to: OrderStatus, expectedVersion: number): Order {
  if (order.version !== expectedVersion) {
    throw new OptimisticLockError();
  }

  assertTransition(order.status, to);
  return {
    ...order,
    status: to,
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}
