import { AsyncLocalStorage } from "node:async_hooks";
import type { ProtocolEvent } from "./types";

const store = new AsyncLocalStorage<ProtocolEvent[]>();

export const recordEvent = (event: ProtocolEvent): void => {
  store.getStore()?.push(event);
};

export const capture = async (fn: () => Promise<void>): Promise<ProtocolEvent[]> => {
  const events: ProtocolEvent[] = [];
  await store.run(events, fn);
  return events;
};
