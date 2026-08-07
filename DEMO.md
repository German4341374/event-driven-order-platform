# Five-Minute Demonstration

1. Run `docker compose up --build --detach --wait`.
2. Open `http://127.0.0.1:8080/docs` and show the order API.
3. Run `node scripts/smoke.mjs`.
4. Show that two requests with one idempotency key returned one order ID.
5. Read `/api/orders/{id}/history` and explain `PENDING -> RESERVED -> CONFIRMED`.
6. Stop Redpanda, create another order, and show the unpublished PostgreSQL outbox row.
7. Restart Redpanda and show automatic recovery without changing the API request.
8. Finish with `docker compose down --volumes --remove-orphans`.
