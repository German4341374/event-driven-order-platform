# Architecture and Delivery Semantics

## Consistency boundary

The order aggregate, its history row, and its outgoing message are written in one PostgreSQL
transaction. The API never attempts to update PostgreSQL and Redpanda in the same request because
there is no shared atomic commit protocol. The outbox worker bridges that boundary asynchronously.

## Delivery guarantees

The publisher provides at-least-once delivery. A crash after Redpanda accepts a message but before
`published_at` is committed causes a duplicate. Consumers claim `consumer_name + message_id` in
the same transaction that persists their next command, so duplicates do not repeat business work.

This is not exactly-once processing across PostgreSQL and Redpanda. The design makes duplicate
delivery explicit and harmless instead of relying on timing assumptions.

## Ordering

The order ID is the Kafka message key, so one order remains in one partition. Global order across
different orders is neither guaranteed nor required. Aggregate versioning protects direct API
updates, while the saga locks the selected order row before changing state.

## Failure recovery

- PostgreSQL unavailable: readiness fails and no new work is accepted.
- Redpanda unavailable: writes continue into the outbox until storage pressure becomes unsafe.
- Publisher crash: another worker claims unpublished rows with `SKIP LOCKED`.
- Consumer crash: Kafka redelivers; the processed-message key suppresses duplicate effects.
- Poisoned publish: ten failed attempts move the row to the outbox dead-letter state for repair.
