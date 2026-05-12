import { recordEvent } from "./capture";
import type { ProtocolEvent } from "./types";

let counter = 0;
export const nextEventId = (): string => `${Date.now()}-${(counter = (counter + 1) >>> 0)}`;

interface InstrumentMeta {
  protocol: ProtocolEvent["protocol"];
  command: string;
  args?: unknown[];
}

export async function instrument<T>(meta: InstrumentMeta, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const base = { ...meta, id: nextEventId(), timestamp: Date.now() };
  try {
    const response = await run();
    recordEvent({ ...base, durationMs: performance.now() - start, status: "ok", response });
    return response;
  } catch (err) {
    recordEvent({
      ...base,
      durationMs: performance.now() - start,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
