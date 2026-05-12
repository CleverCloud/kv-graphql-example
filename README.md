# Materia KV Dual Protocol Example on Clever Cloud

An interactive demo that shows the **same data flowing through Redis (write) and GraphQL (read)** on a [Materia KV](https://www.clever-cloud.com/developers/doc/addons/materia-kv/) add-on. Click a scenario and the app shows you exactly which Redis commands are sent, then which GraphQL query reads the result back — side by side, with the raw commands, queries, variables, responses, and timings.

Built with [Bun](https://bun.sh) (native `Bun.serve` routes, `Bun.file`, `Bun.RedisClient`) — no framework, no client libraries beyond `@types/bun`.

## Prerequisites

- A [Clever Cloud account](https://console.clever-cloud.com/)
- [Clever Tools](https://github.com/CleverCloud/clever-tools) installed and logged in:
  ```bash
  npm i -g clever-tools
  clever login
  ```
- [Bun](https://bun.sh) ≥ 1.3 for local development (the project uses Bun-native APIs)

## Deploy on Clever Cloud

Clone this repository:

```bash
git clone https://github.com/CleverCloud/kv-graphql-example
cd kv-graphql-example
```

Create a Bun & Node.js application — Clever Cloud auto-detects Bun from `bun.lock` and runs it natively:

```bash
clever create -t node -a kv-graphql-example
```

Create a Materia KV add-on and link it to the application in one step — `KV_HOST`, `KV_PORT`, and `KV_TOKEN` are then injected automatically:

```bash
clever addon create kv kv-graphql-example --link kv-graphql-example
```

Set the GraphQL endpoint:

```bash
clever env set KV_GRAPHQL_URL "https://materiakv-graphql.eu-fr-1.services.clever-cloud.com/graphql"
```

Deploy and open the app:

```bash
clever deploy
clever open
```

Learn more about [Node.js/Bun deployment](https://www.clever-cloud.com/developers/doc/applications/nodejs) and the [Materia KV GraphQL layer](https://www.clever-cloud.com/developers/doc/addons/materia-kv/#using-the-graphql-compatibility-layer).

## Local development

Pull the add-on credentials into a local `.env` file:

```bash
clever addon env kv-graphql-example >> .env
echo 'KV_GRAPHQL_URL="https://materiakv-graphql.eu-fr-1.services.clever-cloud.com/graphql"' >> .env
```

Install and run:

```bash
bun install
bun start                          # http://localhost:8080
```

Bun loads `.env` automatically — the app itself only reads from `process.env`, so any other loader (`direnv`, `dotenvx`, exported shell variables, platform env config) works the same way.

| Variable          | Required | Default | Description |
|-------------------|----------|---------|-------------|
| `KV_HOST`         | yes      | —       | Materia KV Redis hostname (set by the add-on) |
| `KV_PORT`         | no       | `6379`  | TLS Redis port (set by the add-on) |
| `KV_TOKEN`        | yes      | —       | Token — used as the Redis password and the GraphQL Bearer (set by the add-on) |
| `KV_GRAPHQL_URL`  | yes      | —       | Full GraphQL endpoint URL (see above) |
| `PORT`            | no       | `8080`  | HTTP port the demo listens on |

## Scenarios

| # | Title | What it shows |
|---|-------|---------------|
| 1 | String round-trip                  | `SET` via Redis, `string(key)` via GraphQL |
| 2 | Structured record                  | `HSET` ↔ `hash(key) { fields }` |
| 3 | Unordered collection               | `SADD` ↔ `getSetMembers(key)` |
| 4 | Set intersection in one query      | `SADD` ×2 ↔ `setIntersection(keys)` |
| 5 | Expiration across protocols        | Redis TTL (seconds, relative) ↔ GraphQL `expireAt` (ISO 8601 instant) |
| 6 | JSON document                      | `JSON.SET` ↔ `string(key)` (serialized document) |

Each scenario is self-contained: it clears its own keys under `demo:scenario:*`, seeds what it needs via Redis, reads it back via GraphQL, and returns every operation (commands, queries, responses, timings) to the frontend in one HTTP round-trip. The demo never issues `FLUSHDB` or `FLUSHALL` — safe against a shared cluster.

## API

- `GET /api/info` — `{ redisPort, scenarioCount }`
- `GET /api/scenarios` — list of available scenarios (`id`, `shortTitle`, `title`, `summary`, `narrative`)
- `POST /api/scenarios/:id` — runs the scenario and returns `{ id, title, narrative, events }` where `events` is the captured Redis + GraphQL trace with arguments, responses, statuses, and durations

## Architecture

```
.
├── src/
│   ├── config.ts         # Strict env validation (fail-fast)
│   ├── types.ts          # ProtocolEvent discriminated union
│   ├── capture.ts        # AsyncLocalStorage — per-request event collection
│   ├── instrument.ts     # Wraps async calls and records events into the current capture store
│   ├── redis-client.ts   # Bun-native RedisClient + instrumentation
│   ├── graphql-client.ts # fetch + instrumentation
│   ├── scenarios.ts      # The 6 scenarios, each a self-contained function
│   └── server.ts         # Bun.serve routes — static files + /api/scenarios
└── public/
    ├── index.html
    ├── style.css
    └── app.js            # Vanilla JS, no framework
```

