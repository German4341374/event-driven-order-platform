import { randomUUID } from 'node:crypto';

import type { OrderStatus, SimulationMode } from './order.js';

export type EventType =
  | 'OrderCreated'
  | 'OrderStatusChanged'
  | 'InventoryReserved'
  | 'InventoryRejected'
  | 'PaymentCaptured'
  | 'PaymentFailed';

export type CommandType = 'ReserveInventory' | 'CapturePayment';

export interface Message<TType extends string = string, TPayload = Record<string, unknown>> {
  id: string;
  type: TType;
  aggregateId: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export type DomainEvent = Message<
  EventType,
  {
    orderId: string;
    simulation?: SimulationMode;
    from?: OrderStatus;
    to?: OrderStatus;
    reason?: string;
  }
>;

export type WorkflowCommand = Message<CommandType, { orderId: string; simulation: SimulationMode }>;

export function createMessage<TType extends string, TPayload>(
  type: TType,
  aggregateId: string,
  payload: TPayload,
  correlationId: string = randomUUID(),
  causationId?: string,
): Message<TType, TPayload> {
  return {
    id: randomUUID(),
    type,
    aggregateId,
    occurredAt: new Date().toISOString(),
    correlationId,
    ...(causationId === undefined ? {} : { causationId }),
    payload,
  };
}
