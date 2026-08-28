import "server-only";

import { MemoryThreadStore, NeonThreadStore, type ThreadStore } from "./store.ts";

export type ThreadStoreBinding = {
  store: ThreadStore;
  durable: boolean;
  warning: string | null;
};

let binding: ThreadStoreBinding | undefined;

export function getThreadStoreBinding(): ThreadStoreBinding {
  if (binding) return binding;
  const connectionString = process.env.DATABASE_URL?.trim();
  binding = connectionString
    ? { store: new NeonThreadStore(connectionString), durable: true, warning: null }
    : {
        store: new MemoryThreadStore(),
        durable: false,
        warning: "History is unavailable and this conversation may not survive a server restart.",
      };
  return binding;
}

export function setThreadStoreBindingForTest(value: ThreadStoreBinding | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("thread_store_test_only");
  binding = value;
}
