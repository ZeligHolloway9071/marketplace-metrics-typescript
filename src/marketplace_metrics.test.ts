import assert from "node:assert/strict";
import { InfraiClient, metricEvents, handoffSchema } from "./marketplace_metrics";

const handoff = handoffSchema.parse({ sellerId: "s", buyerId: "b", orderId: "o", amountUsd: 10, status: "delivered" });
const events = metricEvents(handoff);
assert.equal(events.length, 3);
assert.equal(events[2].value, 10);
assert.equal(events[1].tags.status, "delivered");
const requests: unknown[] = [];
const client = new InfraiClient("test-key", (async (_url, init) => {
  requests.push(JSON.parse(init?.body as string));
  return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
}) as typeof fetch);
for (const event of events) await client.report(event.metric, event.value, event.tags);
assert.deepEqual(requests, events.map((event) => ({
  name: event.metric,
  value: event.value,
  type: event.metric === "marketplace.order_handoff_usd" ? "gauge" : "counter",
  tags: event.tags,
  idempotency_key: `marketplace-${event.tags.order_id}-${event.metric}`
})));
console.log("metric decision test passed");
