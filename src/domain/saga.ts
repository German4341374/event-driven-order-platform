import { createMessage, type DomainEvent, type WorkflowCommand } from './messages.js';

export interface SagaDecision {
  targetStatus?: 'RESERVED' | 'CONFIRMED' | 'CANCELLED';
  commands: WorkflowCommand[];
  reason?: string;
}

export function decideSaga(event: DomainEvent): SagaDecision {
  const simulation = event.payload.simulation ?? 'success';
  const context = [event.aggregateId, event.correlationId, event.id] as const;

  switch (event.type) {
    case 'OrderCreated':
      return {
        commands: [
          createMessage(
            'ReserveInventory',
            context[0],
            { orderId: context[0], simulation },
            context[1],
            context[2],
          ),
        ],
      };
    case 'InventoryReserved':
      return {
        targetStatus: 'RESERVED',
        commands: [
          createMessage(
            'CapturePayment',
            context[0],
            { orderId: context[0], simulation },
            context[1],
            context[2],
          ),
        ],
      };
    case 'PaymentCaptured':
      return { targetStatus: 'CONFIRMED', commands: [] };
    case 'InventoryRejected':
    case 'PaymentFailed':
      return {
        targetStatus: 'CANCELLED',
        commands: [],
        reason: event.payload.reason ?? event.type,
      };
    case 'OrderStatusChanged':
      return { commands: [] };
  }
}

export function executeDemoCommand(command: WorkflowCommand): DomainEvent {
  const shared = [command.aggregateId, command.correlationId, command.id] as const;

  if (command.type === 'ReserveInventory') {
    if (command.payload.simulation === 'inventory_failure') {
      return createMessage(
        'InventoryRejected',
        shared[0],
        { orderId: shared[0], simulation: command.payload.simulation, reason: 'demo stock outage' },
        shared[1],
        shared[2],
      );
    }
    return createMessage(
      'InventoryReserved',
      shared[0],
      { orderId: shared[0], simulation: command.payload.simulation },
      shared[1],
      shared[2],
    );
  }

  if (command.payload.simulation === 'payment_failure') {
    return createMessage(
      'PaymentFailed',
      shared[0],
      {
        orderId: shared[0],
        simulation: command.payload.simulation,
        reason: 'demo payment decline',
      },
      shared[1],
      shared[2],
    );
  }
  return createMessage(
    'PaymentCaptured',
    shared[0],
    { orderId: shared[0], simulation: command.payload.simulation },
    shared[1],
    shared[2],
  );
}
