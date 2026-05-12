import { config } from "./config";
import { instrument } from "./instrument";

interface GqlResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const GQL_TIMEOUT_MS = 10_000;

export const gqlQuery = <T = unknown>(
  label: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | undefined> =>
  instrument(
    { protocol: "graphql", command: label, args: [query.trim(), variables ?? {}] },
    async () => {
      const res = await fetch(config.graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GQL_TIMEOUT_MS),
      });

      const body = await res.json().catch(() => null) as GqlResponse<T> | null;
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
      if (!body) throw new Error("GraphQL response was not valid JSON");
      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
      return body.data;
    },
  );
