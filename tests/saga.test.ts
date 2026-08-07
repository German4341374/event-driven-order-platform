import { describe, expect, it } from 'vitest';

import { createMessage, type DomainEvent, type WorkflowCommand } from '../src/domain/messages.js';
import { decideSaga, executeDemoCommand } from '../src/domain/saga.js';

function event(
  type: DomainEvent['type'],
  simulation: DomainEvent['payload']['simulation'] = 'success',
) {
  return createMessage(type, 'order-1', { orderId: 'order-1', simulation }) as DomainEvent;
}

describe('order saga decisions', () => {
  it('requests inventory after order creation', () => {
    expect(decideSaga(event('OrderCreated')).commands[0]?.type).toBe('ReserveInventory');
  });

  it('reserves the order and requests payment', () => {
    const decision = decideSaga(event('InventoryReserved'));
    expect(decision.targetStatus).toBe('RESERVED');
    expect(decision.commands[0]?.type).toBe('CapturePayment');
  });

  it('confirms after payment capture', () => {
    expect(decideSaga(event('PaymentCaptured'))).toEqual({
      targetStatus: 'CONFIRMED',
      commands: [],
    });
  });

  it('cancels after inventory rejection', () => {
    expect(decideSaga(event('InventoryRejected')).targetStatus).toBe('CANCELLED');
  });

  it('cancels after payment failure', () => {
    expect(decideSaga(event('PaymentFailed')).targetStatus).toBe('CANCELLED');
  });

  it('ignores status audit events', () => {
    expect(decideSaga(event('OrderStatusChanged')).commands).toHaveLength(0);
  });

  it('simulates successful inventory reservation', () => {
    const command = createMessage('ReserveInventory', 'order-1', {
      orderId: 'order-1',
      simulation: 'success',
    }) as WorkflowCommand;
    expect(executeDemoCommand(command).type).toBe('InventoryReserved');
  });

  it('simulates inventory failure', () => {
    const command = createMessage('ReserveInventory', 'order-1', {
      orderId: 'order-1',
      simulation: 'inventory_failure',
    }) as WorkflowCommand;
    expect(executeDemoCommand(command).type).toBe('InventoryRejected');
  });

  it('simulates payment failure', () => {
    const command = createMessage('CapturePayment', 'order-1', {
      orderId: 'order-1',
      simulation: 'payment_failure',
    }) as WorkflowCommand;
    expect(executeDemoCommand(command).type).toBe('PaymentFailed');
  });
});
