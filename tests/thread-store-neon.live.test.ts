import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appendPendingUser, emptyThreadSnapshot } from "../src/lib/threads/snapshot.ts";
import { NeonThreadStore, ThreadConflictError } from "../src/lib/threads/store.ts";

const connectionString = process.env.DATABASE_URL?.trim();

describe.runIf(Boolean(connectionString))("real Neon ThreadStore", () => {
  it("creates, lists, loads, revises, rejects stale writes, reloads through a fresh client, and hard-deletes", async () => {
    const id = randomUUID();
    const firstStore = new NeonThreadStore(connectionString!);
    const userSnapshot = appendPendingUser(emptyThreadSnapshot(id), {
      runId: "run_real_neon_contract",
      message: "Prove the real Neon Research Thread contract.",
      depth: "standard",
      createdAt: new Date().toISOString(),
    });

    try {
      const created = await firstStore.create({ id, title: "Real Neon contract proof", snapshot: userSnapshot });
      expect(created.revision).toBe(1);
      expect((await firstStore.list(50)).some((thread) => thread.id === id)).toBe(true);

      const updated = await firstStore.save({ id, expectedRevision: created.revision, snapshot: { ...created.snapshot, checkpoint: "evidence" } });
      expect(updated.revision).toBe(2);
      await expect(firstStore.save({ id, expectedRevision: created.revision, snapshot: created.snapshot })).rejects.toBeInstanceOf(ThreadConflictError);

      const restartedStore = new NeonThreadStore(connectionString!);
      const reloaded = await restartedStore.load(id);
      expect(reloaded?.revision).toBe(2);
      expect(reloaded?.snapshot.checkpoint).toBe("evidence");
      expect(reloaded?.snapshot.conversation[0]?.text).toBe("Prove the real Neon Research Thread contract.");
      expect(await restartedStore.delete(id)).toBe(true);
      expect(await restartedStore.load(id)).toBeNull();
    } finally {
      await firstStore.delete(id).catch(() => false);
    }
  });
});
