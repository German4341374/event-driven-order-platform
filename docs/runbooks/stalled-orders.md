# Stalled Order Runbook

1. Check `/health/ready`, PostgreSQL health, and Redpanda cluster health.
2. Count unpublished and dead-lettered outbox rows.
3. Inspect consumer lag for `order-saga-v1` and `demo-fulfillment-v1`.
4. Correlate logs using the order ID, message ID, and correlation ID.
5. Restore the unavailable dependency before replaying work.
6. For an outbox row whose failure is understood and corrected, clear `dead_lettered_at`, reset
   `attempts`, and preserve the original message ID.
7. Confirm the order history contains one logical transition per external event.

Never delete processed-message records merely to force a replay. Use a new explicit replay message
with an audit reason so the operation remains observable.
