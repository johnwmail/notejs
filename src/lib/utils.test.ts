// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateNoteID,
  generateNoteID,
  escapeHTML,
  escapeHTMLServer,
  extractPathNoteID,
  extractNoteID,
  isCurlRequest,
  getBaseURL,
  clientIP,
} from "./utils";

const VALID_NOTE_ID_REGEX = /^[A-HJ-NP-Z2-9]{3,32}$/;
const WORDNN_REGEX = /^[A-Z]{3,5}[2-9]{2}$/;

describe("validateNoteID", () => {
  it("accepts valid note IDs", () => {
    expect(validateNoteID("ACE23")).toBe(true);
    expect(validateNoteID("FARM99")).toBe(true);
    expect(validateNoteID("ZEBRA42")).toBe(true);
  });

  it("rejects IDs with I, O, 0, 1 characters", () => {
    expect(validateNoteID("ACE0")).toBe(false);
    expect(validateNoteID("ACE1")).toBe(false);
    expect(validateNoteID("AIO23")).toBe(false);
    expect(validateNoteID("HELLO0")).toBe(false);
  });

  it("rejects IDs that are too short", () => {
    expect(validateNoteID("AB")).toBe(false);
    expect(validateNoteID("A")).toBe(false);
    expect(validateNoteID("")).toBe(false);
  });

  it("rejects IDs that are too long", () => {
    expect(validateNoteID("A".repeat(33))).toBe(false);
  });

  it("rejects IDs with lowercase letters", () => {
    expect(validateNoteID("ace23")).toBe(false);
    expect(validateNoteID("Hello99")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(validateNoteID("")).toBe(false);
  });

  it("rejects IDs with special characters", () => {
    expect(validateNoteID("ACE-23")).toBe(false);
    expect(validateNoteID("ACE_23")).toBe(false);
    expect(validateNoteID("ACE 23")).toBe(false);
  });

  it("accepts max length ID", () => {
    expect(validateNoteID("A".repeat(32).replace(/[IO]/g, "Z"))).toBe(true);
  });
});

describe("generateNoteID", () => {
  it("generates a string", () => {
    const id = generateNoteID();
    expect(typeof id).toBe("string");
  });

  it("generates a valid note ID", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateNoteID();
      expect(validateNoteID(id)).toBe(true);
    }
  });

  it("matches WORDnn pattern", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateNoteID();
      expect(id).toMatch(WORDNN_REGEX);
    }
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateNoteID());
    }
    expect(ids.size).toBeGreaterThan(50);
  });

  it("ends with two digits", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateNoteID();
      const digits = id.slice(-2);
      expect(digits).toMatch(/^[2-9]{2}$/);
    }
  });
});

describe("escapeHTML", () => {
  it("escapes < and >", () => {
    expect(escapeHTML("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert('xss')&lt;/script&gt;");
  });

  it("escapes &", () => {
    expect(escapeHTML("a & b")).toBe("a &amp; b");
  });

  it("does not escape double quotes (textContent behavior)", () => {
    expect(escapeHTML('say "hello"')).toBe('say "hello"');
  });

  it("returns empty string unchanged", () => {
    expect(escapeHTML("")).toBe("");
  });

  it("passes through safe strings", () => {
    expect(escapeHTML("hello world")).toBe("hello world");
  });
});

describe("escapeHTMLServer", () => {
  it("escapes < and >", () => {
    expect(escapeHTMLServer("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("escapes &", () => {
    expect(escapeHTMLServer("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHTMLServer('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHTMLServer("it's")).toBe("it&#39;s");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHTMLServer("")).toBe("");
  });

  it("passes through safe strings", () => {
    expect(escapeHTMLServer("hello world")).toBe("hello world");
  });

  it("handles all special characters together", () => {
    const input = `<a href="test" onclick='evil'>a & b</a>`;
    const expected = `&lt;a href=&quot;test&quot; onclick=&#39;evil&#39;&gt;a &amp; b&lt;/a&gt;`;
    expect(escapeHTMLServer(input)).toBe(expected);
  });
});

describe("extractPathNoteID", () => {
  it("extracts ID from /noteid/ path", () => {
    expect(extractPathNoteID("/noteid/ACE23")).toBe("ACE23");
  });

  it("extracts ID from nested path", () => {
    expect(extractPathNoteID("/app/noteid/ACE23")).toBe("ACE23");
  });

  it("handles trailing slash", () => {
    expect(extractPathNoteID("/noteid/ACE23/")).toBe("ACE23");
  });

  it("returns empty string when no noteid in path", () => {
    expect(extractPathNoteID("/")).toBe("");
    expect(extractPathNoteID("/about")).toBe("");
  });

  it("returns empty string for empty path", () => {
    expect(extractPathNoteID("")).toBe("");
  });
});

describe("extractNoteID", () => {
  it("extracts from query parameter", () => {
    const url = new URL("http://example.com/?note=ACE23");
    expect(extractNoteID(url)).toBe("ACE23");
  });

  it("extracts from path when query param missing", () => {
    const url = new URL("http://example.com/noteid/XYZ99");
    expect(extractNoteID(url)).toBe("XYZ99");
  });

  it("query param takes precedence over path", () => {
    const url = new URL("http://example.com/noteid/XYZ99?note=ABC12");
    expect(extractNoteID(url)).toBe("ABC12");
  });

  it("returns empty when no note ID present", () => {
    const url = new URL("http://example.com/");
    expect(extractNoteID(url)).toBe("");
  });
});

describe("isCurlRequest", () => {
  it("detects curl user agent", () => {
    expect(isCurlRequest("curl/7.68.0")).toBe(true);
  });

  it("detects curl with extra info", () => {
    expect(isCurlRequest("curl/8.0.0 (x86_64)")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isCurlRequest("CURL/7.0")).toBe(true);
    expect(isCurlRequest("Curl/7.0")).toBe(true);
  });

  it("returns false for browser user agents", () => {
    expect(isCurlRequest("Mozilla/5.0 Chrome/120")).toBe(false);
    expect(isCurlRequest("Wget/1.21")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCurlRequest("")).toBe(false);
  });
});

describe("getBaseURL", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses URL env var when set", () => {
    process.env.URL = "https://example.com/app/";
    const req = new Request("http://internal/");
    const url = new URL("http://internal/");
    expect(getBaseURL(req, url)).toBe("https://example.com/app/");
  });

  it("appends trailing slash to URL env var if missing", () => {
    process.env.URL = "https://example.com/app";
    const req = new Request("http://internal/");
    const url = new URL("http://internal/");
    expect(getBaseURL(req, url)).toBe("https://example.com/app/");
  });

  it("uses x-forwarded-proto and x-forwarded-host", () => {
    const req = new Request("http://internal/", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "myapp.com",
      },
    });
    const url = new URL("http://internal/");
    expect(getBaseURL(req, url)).toBe("https://myapp.com/");
  });

  it("strips /noteid/ path suffix", () => {
    const req = new Request("https://example.com/noteid/ACE23");
    const url = new URL("https://example.com/noteid/ACE23");
    const base = getBaseURL(req, url);
    expect(base).toBe("https://example.com/");
    expect(base.endsWith("/")).toBe(true);
  });

  it("preserves subpath when present", () => {
    const req = new Request("https://example.com/app/noteid/ACE23");
    const url = new URL("https://example.com/app/noteid/ACE23");
    const base = getBaseURL(req, url);
    expect(base).toBe("https://example.com/app/");
  });
});

describe("clientIP", () => {
  it("extracts from Forwarded header", () => {
    const req = new Request("http://example.com/", {
      headers: { forwarded: 'for="203.0.113.42";proto=https' },
    });
    expect(clientIP(req)).toBe("203.0.113.42");
  });

  it("extracts first IP from x-forwarded-for", () => {
    const req = new Request("http://example.com/", {
      headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
    });
    expect(clientIP(req)).toBe("203.0.113.42");
  });

  it("extracts from x-real-ip", () => {
    const req = new Request("http://example.com/", {
      headers: { "x-real-ip": "10.0.0.5" },
    });
    expect(clientIP(req)).toBe("10.0.0.5");
  });

  it("x-forwarded-for takes precedence over x-real-ip", () => {
    const req = new Request("http://example.com/", {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-real-ip": "10.0.0.1",
      },
    });
    expect(clientIP(req)).toBe("198.51.100.1");
  });

  it("returns unknown when no IP headers present", () => {
    const req = new Request("http://example.com/");
    expect(clientIP(req)).toBe("unknown");
  });

  it("x-forwarded-for uses first IP in comma list", () => {
    const req = new Request("http://example.com/", {
      headers: { "x-forwarded-for": " 198.51.100.1 , 10.0.0.1 " },
    });
    expect(clientIP(req)).toBe("198.51.100.1");
  });

  it("strips port from x-forwarded-for", () => {
    const req = new Request("http://example.com/", {
      headers: { "x-forwarded-for": "203.0.113.42:8080" },
    });
    expect(clientIP(req)).toBe("203.0.113.42");
  });
});
