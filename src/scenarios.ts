// Each scenario is a self-contained demo: it resets its own slice of the
// keyspace, writes some data via Redis, and reads it back via GraphQL. The
// captured events are returned to the frontend, which renders them side by side.

import { instrumentedRedis } from "./redis-client";
import { gqlQuery } from "./graphql-client";

const PREFIX = "demo:scenario:";

export interface ScenarioDef {
  id: string;
  shortTitle: string;
  title: string;
  summary: string;
  narrative: string;
  run: () => Promise<void>;
}

const clearPrefix = async (suffix: string): Promise<void> => {
  const keys = await instrumentedRedis.scanKeys(`${PREFIX}${suffix}*`);
  if (keys.length > 0) await instrumentedRedis.delAll(keys);
};

const scenarios: ScenarioDef[] = [
  {
    id: "strings",
    shortTitle: "Strings",
    title: "String round-trip",
    summary: "Writes a single key/value via Redis SET, then reads it back via GraphQL `string(key)`.",
    narrative: "The baseline case: anything written through Redis is immediately visible through GraphQL, against the same cluster, with no synchronization layer in between.",
    async run() {
      await clearPrefix("string:");
      await instrumentedRedis.set(`${PREFIX}string:greeting`, "Hello, Materia!");
      await gqlQuery(
        "string",
        `query ReadGreeting($key: String!) {
  string(key: $key) { key value }
}`,
        { key: `${PREFIX}string:greeting` },
      );
    },
  },

  {
    id: "hash",
    shortTitle: "Hashes",
    title: "Structured record",
    summary: "Writes a multi-field object via Redis HSET, then reads every field via GraphQL `hash(key)`.",
    narrative: "Redis hashes carry structured data. GraphQL returns them as a typed list of `{name, value}` pairs — no client-side parsing, no field lookups.",
    async run() {
      await clearPrefix("user:alice");
      await instrumentedRedis.hset(
        `${PREFIX}user:alice`,
        "name", "Alice",
        "role", "admin",
        "email", "alice@example.com",
        "active", "true",
      );
      await gqlQuery(
        "hash",
        `query ReadUser($key: String!) {
  hash(key: $key) {
    key
    fields { name value }
  }
}`,
        { key: `${PREFIX}user:alice` },
      );
    },
  },

  {
    id: "set",
    shortTitle: "Sets",
    title: "Unordered collection",
    summary: "Adds several members via Redis SADD, then reads them back via GraphQL `getSetMembers(key)`.",
    narrative: "A set groups values without duplicates and without order. Both protocols expose it as a first-class collection.",
    async run() {
      await clearPrefix("group:admins");
      await instrumentedRedis.sadd(`${PREFIX}group:admins`, "alice", "bob", "carol");
      await gqlQuery(
        "getSetMembers",
        `query ReadGroup($key: String!) {
  getSetMembers(key: $key) { key members }
}`,
        { key: `${PREFIX}group:admins` },
      );
    },
  },

  {
    id: "intersection",
    shortTitle: "Intersection",
    title: "Set intersection in one query",
    summary: "Populates two sets via Redis SADD, then asks for their intersection in a single GraphQL `setIntersection(keys)` call.",
    narrative: "GraphQL exposes set algebra as a read field. Finding the members that belong to two groups at once takes one query — no SINTER, no pre-computed index, no client-side merge.",
    async run() {
      await clearPrefix("group:");
      await instrumentedRedis.sadd(`${PREFIX}group:admins`, "alice", "bob", "carol");
      await instrumentedRedis.sadd(`${PREFIX}group:active`, "alice", "carol", "dave");
      await gqlQuery(
        "setIntersection",
        `query AdminsAndActive($keys: [String!]!) {
  setIntersection(keys: $keys)
}`,
        { keys: [`${PREFIX}group:admins`, `${PREFIX}group:active`] },
      );
    },
  },

  {
    id: "ttl",
    shortTitle: "TTL",
    title: "Expiration across protocols",
    summary: "Sets a key with a 300-second TTL via Redis (`SET ... EX 300`), then reads the GraphQL `expireAt` field (typed as the `DateTime` scalar, serialized as RFC 3339 / ISO 8601).",
    narrative: "Redis takes a relative TTL in seconds; GraphQL returns the absolute expiration instant as an ISO 8601 string. Two representations, one source of truth.",
    async run() {
      await clearPrefix("session:");
      await instrumentedRedis.setEx(`${PREFIX}session:xyz`, "auth-token-42", 300);
      await gqlQuery(
        "string with expireAt",
        `query ReadSession($key: String!) {
  string(key: $key) { key value expireAt }
}`,
        { key: `${PREFIX}session:xyz` },
      );
    },
  },

  {
    id: "json",
    shortTitle: "JSON",
    title: "JSON document",
    summary: "Stores a JSON document via `JSON.SET $`, then reads the serialized payload back as a plain string via GraphQL.",
    narrative: "Materia KV stores JSON on top of strings while keeping the Redis JSON API. GraphQL exposes the serialized document — parse it client-side, every field round-trips intact.",
    async run() {
      await clearPrefix("config");
      const doc = {
        theme: "dark",
        locale: "fr-FR",
        features: ["beta", "v2-api"],
        limits: { maxUploadMb: 50, rateLimit: 1000 },
      };
      await instrumentedRedis.jsonSet(`${PREFIX}config`, "$", JSON.stringify(doc));
      await gqlQuery(
        "string",
        `query ReadConfig($key: String!) {
  string(key: $key) { key value }
}`,
        { key: `${PREFIX}config` },
      );
    },
  },
];

const byId = new Map(scenarios.map((s) => [s.id, s]));
const summary = scenarios.map(({ id, shortTitle, title, summary, narrative }) => ({
  id, shortTitle, title, summary, narrative,
}));

export const getScenario = (id: string): ScenarioDef | undefined => byId.get(id);
export const listScenarios = (): typeof summary => summary;
