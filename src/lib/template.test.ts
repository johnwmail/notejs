import { describe, it, expect } from "vitest";
import { renderHTML } from "./template";
import { APP_VERSION } from "./version";

describe("renderHTML", () => {
  it("returns a non-empty string", () => {
    const html = renderHTML("", "");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("is valid HTML5 with doctype", () => {
    const html = renderHTML("", "");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("shows the app version and links to the favicon", () => {
    const html = renderHTML("", "");
    expect(html).toContain(`class="version-badge">${APP_VERSION}</span>`);
    expect(html).toContain('<link rel="icon" href="/favicon.ico" type="image/gif">');
  });

  it("includes note ID in the page", () => {
    const html = renderHTML("ACE23", "");
    expect(html).toContain("ACE23");
  });

  it("includes note content in textarea", () => {
    const html = renderHTML("", "Hello World");
    expect(html).toContain("Hello World");
  });

  it("escapes XSS in note ID", () => {
    const html = renderHTML('<script>alert("xss")</script>', "");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("escapes XSS in note content", () => {
    const html = renderHTML("", '<img src=x onerror=alert(1)>');
    expect(html).toContain("&lt;img");
    expect(html).toContain('let lastSaved = "<img src=x onerror=alert(1)>";');
  });

  it("includes hidden printable div", () => {
    const html = renderHTML("", "test content");
    expect(html).toContain("id=\"printable\"");
    expect(html).toContain("test content");
  });

  it("includes JavaScript for auto-save", () => {
    const html = renderHTML("", "");
    expect(html).toContain("autoSave");
    expect(html).toContain("setInterval");
  });

  it("includes CSS styles", () => {
    const html = renderHTML("", "");
    expect(html).toContain("<style>");
    expect(html).toContain("--blue-600: #2563EB");
    expect(html).toContain("</style>");
  });

  it("includes status bar", () => {
    const html = renderHTML("", "");
    expect(html).toContain("status-bar");
    expect(html).toContain("statusText");
    expect(html).toContain("statusDot");
  });

  it("includes action buttons", () => {
    const html = renderHTML("", "");
    expect(html).toContain("newNote");
    expect(html).toContain("copyNoteContent");
    expect(html).toContain("copyNoteLink");
  });

  it("includes toast element", () => {
    const html = renderHTML("", "");
    expect(html).toContain("class=\"toast\"");
  });

  it("handles empty note ID gracefully", () => {
    const html = renderHTML("", "");
    expect(html).toContain("noteInfo");
  });

  it("offers password protection when creating a new note", () => {
    const html = renderHTML("", "");
    expect(html).toContain("Password protect (burn after read)");
    expect(html).toContain("Choose protection before the first save.");
  });

  it("does not include protected note content in the locked page", () => {
    const html = renderHTML("ACE23", "secret content", {
      passwordProtected: true,
      locked: true,
    });
    expect(html).toContain("Password protected note");
    expect(html).toContain("unlockForm");
    expect(html).not.toContain("secret content");
  });

  it("offers an optional password change after unlocking", () => {
    const html = renderHTML("ACE23", "content", { passwordProtected: true });
    expect(html).toContain("Change password (optional)");
    expect(html).toContain("Leave blank to keep current password");
  });

  it("renders syntactically valid client JavaScript", () => {
    const html = renderHTML("ACE23", "content", {
      passwordProtected: true,
      locked: true,
    });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("handles special characters in content", () => {
    const content = "line1\nline2\ttabbed";
    const html = renderHTML("", content);
    expect(html).toContain("line1\nline2\ttabbed");
  });

  it("includes responsive CSS breakpoints", () => {
    const html = renderHTML("", "");
    expect(html).toContain("@media (max-width: 640px)");
  });

  it("includes print styles", () => {
    const html = renderHTML("", "");
    expect(html).toContain("@media print");
  });
});
