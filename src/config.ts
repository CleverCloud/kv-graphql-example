export interface Config {
  host: string;
  redisPort: number;
  graphqlUrl: string;
  token: string;
  httpPort: number;
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  return value || fail(`Missing required environment variable: ${name}`);
};

const port = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 65_535
    ? n
    : fail(`Invalid ${name}: ${raw} (expected an integer between 1 and 65535)`);
};

const url = (name: string): string => {
  const raw = required(name);
  try {
    new URL(raw);
    return raw;
  } catch {
    return fail(`Invalid ${name}: ${raw} (expected a full URL like https://host/graphql)`);
  }
};

export const config: Config = {
  host: required("KV_HOST"),
  token: required("KV_TOKEN"),
  redisPort: port("KV_PORT", 6379),
  graphqlUrl: url("KV_GRAPHQL_URL"),
  httpPort: port("PORT", 8080),
};
