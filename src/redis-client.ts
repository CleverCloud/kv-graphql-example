import { RedisClient } from "bun";
import { config } from "./config";
import { instrument } from "./instrument";

const SCAN_PAGE = 100;
const DEL_BATCH = 100;

const redis = new RedisClient(
  `rediss://:${encodeURIComponent(config.token)}@${config.host}:${config.redisPort}`,
  { connectionTimeout: 10_000, tls: true },
);

const exec = <T>(command: string, args: (string | number)[]): Promise<T> =>
  instrument({ protocol: "redis", command, args }, () => redis.send(command, args.map(String)) as Promise<T>);

const delAll = async (keys: string[]): Promise<number> => {
  let total = 0;
  for (let i = 0; i < keys.length; i += DEL_BATCH) {
    const batch = keys.slice(i, i + DEL_BATCH);
    if (batch.length > 0) total += await exec<number>("DEL", batch);
  }
  return total;
};

export const instrumentedRedis = {
  set: (key: string, value: string) => exec<"OK">("SET", [key, value]),

  setEx: (key: string, value: string, seconds: number) =>
    exec<"OK">("SET", [key, value, "EX", seconds]),

  delAll,

  hset: (key: string, ...fieldValues: string[]) => exec<number>("HSET", [key, ...fieldValues]),

  sadd: (key: string, ...members: string[]) => exec<number>("SADD", [key, ...members]),

  jsonSet: (key: string, path: string, value: string) =>
    exec<"OK">("JSON.SET", [key, path, value]),

  scanKeys: (pattern: string): Promise<string[]> =>
    instrument({ protocol: "redis", command: "SCAN", args: ["MATCH", pattern] }, async () => {
      const found: string[] = [];
      let cursor = "0";
      do {
        const result: [string, string[]] = await redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_PAGE);
        cursor = result[0];
        found.push(...result[1]);
      } while (cursor !== "0");
      return found;
    }),
};

export const closeRedis = (): void => {
  redis.close();
};
