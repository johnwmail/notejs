import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "./handler";
import type { NoteResponse } from "./lib/types";
import type { Storage } from "./lib/storage";
import {
  decryptProtectedNote,
  encryptProtectedNote,
  parseProtectedNoteRecord,
  serializeProtectedNote,
} from "./lib/crypto";
import { APP_VERSION } from "./lib/version";

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

    it("prints CLI examples when curl requests the app root", async () => {
      const res = await handleRequest(
        makeReq("https://example.com/", {
          headers: { "User-Agent": "curl/8.0.0" },
        }),
        mockStorage
      );

      expect(res.headers.get("Content-Type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toContain(`Version: ${APP_VERSION}`);
      expect(text).toContain("Usage Examples:");
      expect(text).toContain("--data-binary @/path/to/file.txt");
      expect(text).toContain("password-protected paste");
      expect(text).toContain("YOUR_NOTE_PASSWORD");
      expect(text).toContain("X-Note-Password");
      expect(text).toContain("https://example.com/noteid/NOTE_ID");
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

    it("does not allow adding protection to an existing plaintext note", async () => {
      mockRead.mockResolvedValue("existing note");
      const res = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: "ACE23",
            content: "updated note",
            password: "long-password",
          }),
        }),
        mockStorage
      );

      expect(res.status).toBe(400);
      expect(mockWrite).not.toHaveBeenCalled();
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

    it("creates a protected paste from raw curl input with a password header", async () => {
      let storedValue = "";
      mockRead.mockResolvedValue("");
      mockWrite.mockImplementation(async (_noteID: string, value: string) => {
        storedValue = value;
      });

      const res = await handleRequest(
        makeReq("https://example.com/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "curl/8.0.0",
            "X-Note-Password": "curl-password-phrase",
          },
          body: "secret from stdin",
        }),
        mockStorage
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toMatch(/https:\/\/example\.com\/noteid\/[A-Z0-9]+/);
      const protectedRecord = parseProtectedNoteRecord(storedValue);
      expect(protectedRecord).not.toBeNull();
      expect(await decryptProtectedNote(protectedRecord!, "curl-password-phrase")).toBe(
        "secret from stdin"
      );
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
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-Note-Password");
    });
  });

  describe("favicon.ico", () => {
    it("returns the favicon image for favicon.ico", async () => {
      const res = await handleRequest(
        makeReq("http://example.com/favicon.ico"),
        mockStorage
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/gif");
      expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
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

  describe("password-protected notes", () => {
    it("requires the password, burns on unlock, and republishes on update", async () => {
      let storedValue = "";
      mockRead.mockImplementation(async () => storedValue);
      mockWrite.mockImplementation(async (_noteID: string, value: string) => {
        storedValue = value;
      });
      mockDelete.mockImplementation(async () => {
        storedValue = "";
      });

      const createResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: "ACE23",
            content: "secret note",
            password: "first-long-password",
          }),
        }),
        mockStorage
      );
      expect(createResponse.status).toBe(200);
      const createData: NoteResponse = await createResponse.json();
      expect(createData.passwordProtected).toBe(true);
      expect(storedValue).not.toContain("secret note");

      const lockedResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23"),
        mockStorage
      );
      expect(lockedResponse.status).toBe(200);
      expect(await lockedResponse.text()).toContain("Password protected note");
      expect(storedValue).not.toContain("secret note");

      const wrongPasswordResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unlock",
            noteId: "ACE23",
            password: "wrong-long-password",
          }),
        }),
        mockStorage
      );
      expect(wrongPasswordResponse.status).toBe(401);
      expect(parseProtectedNoteRecord(storedValue)?.state).toBe("active");

      const unlockResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unlock",
            noteId: "ACE23",
            password: "first-long-password",
          }),
        }),
        mockStorage
      );
      expect(unlockResponse.status).toBe(200);
      const unlockData: NoteResponse = await unlockResponse.json();
      expect(unlockData.content).toBe("secret note");
      expect(parseProtectedNoteRecord(storedValue)?.state).toBe("burned");

      const updateResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: "ACE23",
            content: "updated secret",
            password: "first-long-password",
          }),
        }),
        mockStorage
      );
      expect(updateResponse.status).toBe(200);
      const updatedRecord = parseProtectedNoteRecord(storedValue);
      expect(updatedRecord?.state).toBe("active");
      expect(await decryptProtectedNote(updatedRecord!, "first-long-password")).toBe("updated secret");

      const passwordChangeResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: "ACE23",
            content: "updated secret",
            password: "first-long-password",
            newPassword: "second-long-password",
          }),
        }),
        mockStorage
      );
      expect(passwordChangeResponse.status).toBe(200);
      const rotatedRecord = parseProtectedNoteRecord(storedValue);
      expect(await decryptProtectedNote(rotatedRecord!, "second-long-password")).toBe("updated secret");

      const cliResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          headers: {
            "User-Agent": "curl/8.0.0",
            "X-Note-Password": "second-long-password",
          },
        }),
        mockStorage
      );
      expect(cliResponse.status).toBe(200);
      expect(await cliResponse.text()).toBe("updated secret");
      expect(parseProtectedNoteRecord(storedValue)?.state).toBe("burned");

      const reloadResponse = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", {
          headers: {
            "User-Agent": "curl/8.0.0",
            "X-Note-Password": "second-long-password",
          },
        }),
        mockStorage
      );
      expect(reloadResponse.status).toBe(404);
    });

    it("does not consume a protected note on HEAD", async () => {
      const record = await encryptProtectedNote("secret", "long-password");
      mockRead.mockResolvedValue(serializeProtectedNote(record));
      mockWrite.mockResolvedValue(undefined);

      const response = await handleRequest(
        makeReq("http://example.com/noteid/ACE23", { method: "HEAD" }),
        mockStorage
      );

      expect(response.status).toBe(200);
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});
