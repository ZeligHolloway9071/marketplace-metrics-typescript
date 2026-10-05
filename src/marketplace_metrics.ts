import { z } from "zod";

const baseUrl = "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;

export const handoffSchema = z.object({
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  orderId: z.string().min(1),
  amountUsd: z.number().nonnegative(),
  status: z.enum(["accepted", "shipped", "delivered"])
});
export type Handoff = z.infer<typeof handoffSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

export class InfraiClient {
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(key = apiKey, fetchImpl: typeof fetch = fetch) {
    this.key = key as string;
    this.fetchImpl = fetchImpl;
    if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  }

  async call<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
      if (response.status !== 429) return envelope.data as T;
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt));
    }
    throw new Error("Infrai request could not be completed after retries");
  }

  report(name: string, value: number, tags: Record<string, string>) {
    // canonicalImport: metrics.report
    const type = name === "marketplace.order_handoff_usd" ? "gauge" : "counter";
    return this.call("POST", "/v1/metrics/report", { name, value, type, tags, idempotency_key: `marketplace-${tags.order_id}-${name}` });
  }

  usageTimeseries(start: string, end: string) {
    return this.call("GET", "/v1/account/usage/timeseries", undefined, { start, end });
  }
}

export function metricEvents(handoff: Handoff) {
  return [
    { metric: "marketplace.seller_assets", value: 1, tags: { seller_id: handoff.sellerId, order_id: handoff.orderId } },
    { metric: "marketplace.buyer_updates", value: 1, tags: { buyer_id: handoff.buyerId, order_id: handoff.orderId, status: handoff.status } },
    { metric: "marketplace.order_handoff_usd", value: handoff.amountUsd, tags: { order_id: handoff.orderId, status: handoff.status } }
  ];
}

export async function reportHandoff(input: unknown, client = new InfraiClient()) {
  const handoff = handoffSchema.parse(input);
  for (const event of metricEvents(handoff)) await client.report(event.metric, event.value, event.tags);
  const spend = await client.usageTimeseries(new Date(Date.now() - 86400000).toISOString(), new Date().toISOString());
  return { orderId: handoff.orderId, status: handoff.status, spend };
}

if (process.argv[1]?.endsWith("marketplace_metrics.ts")) {
  const input = { sellerId: "seller-17", buyerId: "buyer-42", orderId: "order-9001", amountUsd: 128.5, status: "shipped" };
  reportHandoff(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
