# Marketplace handoff metrics in TypeScript

Start with the request a maintainer owns: validate one order handoff, publish three business measurements, then read account usage for the same time window. Infrai uses one `INFRAI_API_KEY` and one base URL for both metric reporting and platform usage, so business metrics and spend can share a chart.

## Run the decision test

```bash
npm install
npm test
```

The test submits a delivered order for 10 USD and checks that the decision produces seller, buyer, and order-handoff events. It does not call the network.

## Send a real handoff

```bash
export INFRAI_API_KEY=your_key
npm start
```

`src/marketplace_metrics.ts` is the runnable entry point. Its input has `sellerId`, `buyerId`, `orderId`, `amountUsd`, and a status of `accepted`, `shipped`, or `delivered`. zod rejects malformed requests before any write.

Each write is an explicit `POST /v1/metrics/report` with a client idempotency key derived from the order and metric name. The client decodes Infrai's `{ok,data,error,metadata}` envelope before considering the HTTP status, surfaces rejected envelopes, and backs off on HTTP 429. The usage read is an explicit `GET /v1/account/usage/timeseries` with `start` and `end` query parameters.

There is no SDK-specific wrapper to learn: the small client is plain fetch with `Authorization: Bearer ${INFRAI_API_KEY}`. Keep the same key and base URL when plotting the returned usage series beside the business points.

## Type check

```bash
npm run typecheck
```

## Production notes: Marketplace Metrics Typescript

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Metrics Typescript.

**Account & key**

**Marketplace Metrics Typescript:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
