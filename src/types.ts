interface EventBase {
  id: string;
  timestamp: number;
  protocol: "redis" | "graphql";
  command: string;
  args?: unknown[];
  durationMs: number;
}

export type ProtocolEvent =
  | (EventBase & { status: "ok"; response: unknown })
  | (EventBase & { status: "error"; error: string });

export interface ScenarioResult {
  id: string;
  title: string;
  narrative: string;
  events: ProtocolEvent[];
}
