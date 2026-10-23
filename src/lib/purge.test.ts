import { describe, it, expect } from "vitest";
import { purgeAllNotes } from "./purge";

function createFakeKV(
  initial: string[],
  options: { pageSize?: number } = {}
) {
  const pageSize = options.pageSize ?? 1000;
  const keys = new Set(initial);
  const calls = { list: 0, delete: 0 };
  const failKeys = new Set<string>();
  let inFlight = 0;
  let maxInFlight = 0;

  return {
    keys,
    calls,
    failFor(key: string) {
      failKeys.add(key);
    },
    get maxInFlight() {
      return maxInFlight;
    },
    async list() {
      calls.list += 1;
      const names = [...keys].slice(0, pageSize);
      return {
        keys: names.map((name) => ({ name })),
        list_complete: names.length === keys.size,
      };
    },
    async delete(key: string) {
      calls.delete += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if (failKeys.has(key)) throw new Error("delete failed");
      keys.delete(key);
    },
  };
}

describe("purgeAllNotes", () => {
  it("deletes every key in the namespace", async () => {
    const kv = createFakeKV(["ACE23", "BAT45", "CAT67"]);

    const result = await purgeAllNotes(kv);

    expect(result.deleted).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(false);
    expect(kv.keys.size).toBe(0);
    expect(kv.calls.delete).toBe(3);
  });

  it("stops on an empty namespace without deleting", async () => {
    const kv = createFakeKV([]);

    const result = await purgeAllNotes(kv);

    expect(result).toEqual({
      deleted: 0,
      failed: 0,
      operations: 1,
      remaining: false,
    });
    expect(kv.calls.delete).toBe(0);
  });

  it("re-lists from the start after each page instead of using a cursor", async () => {
    const kv = createFakeKV(["ACE23", "BAT45", "CAT67", "DOG89", "EEL01"], {
      pageSize: 2,
    });

    const result = await purgeAllNotes(kv);

    expect(result.deleted).toBe(5);
    expect(result.remaining).toBe(false);
    expect(kv.keys.size).toBe(0);
    // 2 + 2 + 1 keys deleted across three pages.
    expect(kv.calls.list).toBe(3);
    expect(kv.calls.delete).toBe(5);
  });

  it("respects the per-invocation operation budget", async () => {
    const kv = createFakeKV(["A1", "B2", "C3", "D4", "E5", "F6"]);

    const result = await purgeAllNotes(kv, { maxOperations: 4 });

    expect(result.operations).toBe(4);
    expect(result.deleted).toBe(3);
    expect(result.remaining).toBe(true);
    expect(kv.keys.size).toBe(3);
  });

  it("caps concurrent deletes", async () => {
    const keys = Array.from({ length: 120 }, (_, index) => `KEY${index}`);
    const kv = createFakeKV(keys);

    const result = await purgeAllNotes(kv, { concurrency: 10 });

    expect(result.deleted).toBe(120);
    expect(kv.maxInFlight).toBeLessThanOrEqual(10);
  });

  it("counts failures and stops when every delete fails", async () => {
    const kv = createFakeKV(["ACE23", "BAT45"]);
    kv.failFor("ACE23");
    kv.failFor("BAT45");

    const result = await purgeAllNotes(kv);

    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.remaining).toBe(true);
    expect(kv.calls.list).toBe(1);
  });

  it("keeps deleting when only some deletes fail", async () => {
    const kv = createFakeKV(["ACE23", "BAT45", "CAT67"]);
    kv.failFor("BAT45");

    const result = await purgeAllNotes(kv, { maxOperations: 10 });

    expect(result.deleted).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.remaining).toBe(true);
    expect(kv.keys.size).toBe(1);
  });
});
