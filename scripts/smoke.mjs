const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    await request('/health/ready');
    break;
  } catch {
    if (attempt === 59) throw new Error('API did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const idempotencyKey = `smoke-${Date.now()}`;
const createOptions = {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
  body: JSON.stringify({ customerId: 'smoke-customer', amountCents: 4200, simulation: 'success' }),
};
const first = await request('/api/orders', createOptions);
const duplicate = await request('/api/orders', createOptions);
if (first.data.id !== duplicate.data.id) throw new Error('Idempotency contract failed');

let order;
for (let attempt = 0; attempt < 60; attempt += 1) {
  order = (await request(`/api/orders/${first.data.id}`)).data;
  if (order.status === 'CONFIRMED') break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (order?.status !== 'CONFIRMED')
  throw new Error(`Saga did not confirm the order: ${order?.status}`);

const history = await request(`/api/orders/${first.data.id}/history`);
if (history.data.length < 3) throw new Error('Expected persisted workflow history');
console.log(
  JSON.stringify({ status: 'passed', orderId: first.data.id, finalStatus: order.status }),
);
