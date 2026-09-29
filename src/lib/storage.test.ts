import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KVStorage, VercelKVStorage } from "./storage";
import type { Storage } from "./storage";
import { parseProtectedNoteRecord } from "./crypto";

describe("KVStorage", () => {
  let storage: Storage;

  const mockKv = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new KVStorage(mockKv as any);
  });

  it("reads a note", async () => {
    mockKv.get.mockResolvedValue("hello");
    const result = await storage.read("ACE23");
    expect(result).toBe("hello");
    expect(mockKv.get).toHaveBeenCalledWith("ACE23");
  });

  it("returns empty string for missing note", async () => {
    mockKv.get.mockResolvedValue(null);
    const result = await storage.read("ACE23");
    expect(result).toBe("");
  });

  it("returns empty string for empty content", async () => {
    mockKv.get.mockResolvedValue("");
    const result = await storage.read("ACE23");
    expect(result).toBe("");
  });

  it("writes a note with TTL", async () => {
    await storage.write("ACE23", "content");
    expect(mockKv.put).toHaveBeenCalledWith("ACE23", "content", { expirationTtl: 604800 });
  });

  it("deletes a note", async () => {
    await storage.delete("ACE23");
    expect(mockKv.delete).toHaveBeenCalledWith("ACE23");
  });
});

describe("VercelKVStorage", () => {
  let storage: VercelKVStorage;

  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://example.com";
    process.env.KV_REST_API_TOKEN = "test-token";
    storage = new VercelKVStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a note", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "hello" }))
    );
    const result = await storage.read("ACE23");
    expect(result).toBe("hello");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/get/ACE23",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns empty string for missing note", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: null }))
    );
    expect(await storage.read("ACE23")).toBe("");
  });

  it("unwraps values written by the previous JSON-stringifying adapter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: JSON.stringify("legacy note") }))
    );
    expect(await storage.read("ACE23")).toBe("legacy note");
  });

  it("restores legacy protected records that were double-serialized", async () => {
    const protectedValue = JSON.stringify({
      format: "notejs-protected-note",
      version: 1,
      state: "active",
      iterations: 100_000,
      salt: "AQ==",
      verifier: "Ag==",
      iv: "Aw==",
      ciphertext: "BA==",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: JSON.stringify(protectedValue) }))
    );

    const result = await storage.read("ACE23");
    expect(result).toBe(protectedValue);
    expect(parseProtectedNoteRecord(result)?.state).toBe("active");
  });

  it("reads versioned note values from Redis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        result: JSON.stringify({
          format: "notejs-vercel-value-v1",
          value: "stored note",
        }),
      }))
    );
    expect(await storage.read("ACE23")).toBe("stored note");
  });

  it("writes a note with TTL", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "OK" }))
    );
    await storage.write("ACE23", "hello");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/set/ACE23?EX=604800",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ format: "notejs-vercel-value-v1", value: "hello" }),
      })
    );
  });

  it("round-trips serialized protected notes without double encoding", async () => {
    let redisValue = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/set/")) {
        redisValue = String(init?.body);
        return new Response(JSON.stringify({ result: "OK" }));
      }
      return new Response(JSON.stringify({ result: redisValue }));
    });

    const protectedRecord = JSON.stringify({
      format: "notejs-protected-note",
      version: 1,
      state: "active",
      ciphertext: "ciphertext",
    });
    await storage.write("ACE23", protectedRecord);

    expect(redisValue).toBe(
      JSON.stringify({ format: "notejs-vercel-value-v1", value: protectedRecord })
    );
    expect(await storage.read("ACE23")).toBe(protectedRecord);
  });

  it("deletes a note", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: 1 }))
    );
    await storage.delete("ACE23");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/del/ACE23",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on missing env vars", () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(() => new VercelKVStorage()).toThrow("Vercel KV not configured");
  });

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );
    await expect(storage.read("ACE23")).rejects.toThrow("Vercel KV error: 401 Unauthorized");
  });
});
