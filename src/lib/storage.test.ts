import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KVStorage, VercelKVStorage } from "./storage";
import type { Storage } from "./storage";

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

  it("writes a note with TTL", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "OK" }))
    );
    await storage.write("ACE23", "hello");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/set/ACE23?EX=604800",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify("hello"),
      })
    );
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
