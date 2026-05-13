import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "./handler";
import type { NoteResponse } from "./lib/types";
import type { Storage } from "./lib/storage";

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockDelete = vi.fn();

const mockStorage: Storage = {
  read: mockRead,
  write: mockWrite,
  delete: mockDelete,
};

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe("handleRequest", () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockWrite.mockReset();
    mockDelete.mockReset();
  });

  describe("GET requests", () => {
    it("returns HTML for browser GET /", async () => {
      mockRead.mockResolvedValue("");
      const res = await handleRequest(makeReq("http://example.com/"), mockStorage);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("<!DOCTYPE html>");
      expect(text).toContain("Note");
    });

    it("returns HTML for GET with note ID", async () => {
      mockRead.mockResolvedValue("stored content");
      const res = await handleRequest(makeReq("http://example.com/noteid/ACE23"), mockStorage);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("stored content");
      expect(text).toContain("ACE23");
      expect(mockRead).toHaveBeenCalledWith("ACE23");
    });

    it("returns 404 for curl GET with non-existent note", async () => {
      mockRead.mockResolvedValue("");
      const res = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          headers: { "User-Agent": "curl/8.0.0" },
        }),
        mockStorage
      );
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe("Note not found");
    });

    it("returns plain text for curl GET with existing note", async () => {
      mockRead.mockResolvedValue("hello from curl");
      const res = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          headers: { "User-Agent": "curl/8.0.0" },
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("hello from curl");
    });
  });

  describe("POST requests", () => {
    it("creates a new note with generated ID", async () => {
      mockWrite.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: "", content: "new note" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const data: NoteResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.noteId).toBeDefined();
      expect(typeof data.noteId).toBe("string");
      expect(data.noteId!.length).toBeGreaterThanOrEqual(3);
    });

    it("saves note with specified note ID", async () => {
      mockWrite.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: "ACE23", content: "my note" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const data: NoteResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.noteId).toBe("ACE23");
      expect(mockWrite).toHaveBeenCalledWith("ACE23", "my note");
    });

    it("rejects invalid note ID", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: "bad id!", content: "test" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(400);
      const data: NoteResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid note ID");
    });

    it("deletes note when content is empty", async () => {
      mockDelete.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: "ACE23", content: "" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      expect(mockDelete).toHaveBeenCalledWith("ACE23");
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("trims content before checking emptiness", async () => {
      mockDelete.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: "ACE23", content: "   " }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      expect(mockDelete).toHaveBeenCalledWith("ACE23");
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("returns URL for curl POST", async () => {
      mockWrite.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "curl/8.0.0",
          },
          body: JSON.stringify({ noteId: "ACE23", content: "curl note" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("http://example.com/noteid/ACE23");
    });

    it("handles form-urlencoded POST", async () => {
      mockWrite.mockResolvedValue(undefined);
      const body = new URLSearchParams({ text: "form note" });
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toMatch(/^OK: /);
    });

    it("handles form-urlencoded POST with noteId", async () => {
      mockWrite.mockResolvedValue(undefined);
      const body = new URLSearchParams({ text: "form note", noteId: "FARM99" });
      const res = await handleRequest(
        makeReq("http://example.com/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("OK: FARM99\n");
    });

    it("extracts noteId from path for POST", async () => {
      mockWrite.mockResolvedValue(undefined);
      const res = await handleRequest(
        makeReq("http://example.com/noteid/XYZ23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "path note" }),
        }),
        mockStorage
      );
      expect(res.status).toBe(200);
      expect(mockWrite).toHaveBeenCalledWith("XYZ23", "path note");
    });
  });

  describe("OPTIONS requests", () => {
    it("returns 200 with CORS headers", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/", { method: "OPTIONS" }),
        mockStorage
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });

  describe("favicon.ico", () => {
    it("returns 204 for favicon.ico", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/favicon.ico"),
        mockStorage
      );
      expect(res.status).toBe(204);
    });
  });

  describe("unsupported methods", () => {
    it("returns 405 for PUT", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/", { method: "PUT" }),
        mockStorage
      );
      expect(res.status).toBe(405);
    });

    it("returns 405 for DELETE", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/", { method: "DELETE" }),
        mockStorage
      );
      expect(res.status).toBe(405);
    });
  });

  describe("HEAD requests", () => {
    it("handles HEAD like GET", async () => {
      mockRead.mockResolvedValue("");
      const res = await handleRequest(
        makeReq("http://example.com/", { method: "HEAD" }),
        mockStorage
      );
      expect(res.status).toBe(200);
    });
  });
});
