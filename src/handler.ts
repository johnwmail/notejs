import type { Storage } from "./lib/storage";
import type { NoteRequest, NoteResponse } from "./lib/types";
import {
  validateNoteID,
  generateNoteID,
  extractNoteID,
  extractPathNoteID,
  isCurlRequest,
  getBaseURL,
} from "./lib/utils";
import { renderHTML } from "./lib/template";
import { APP_VERSION } from "./lib/version";
import {
  burnProtectedNote,
  decryptProtectedNote,
  encryptProtectedNote,
  InvalidPasswordError,
  MIN_PASSWORD_LENGTH,
  parseProtectedNoteRecord,
  serializeProtectedNote,
  verifyProtectedNotePassword,
} from "./lib/crypto";

const MAX_PASSWORD_LENGTH = 1024;
const FAVICON_BYTES = Uint8Array.from(
  atob("R0lGODlhEAAQAKIGAL7FzEBUaLK5wnOBkJCbp9nd4f///wAAACH5BAEAAAYALAAAAAAQABAAAANJaKrR7msFMga1o8UguvcBECyDUJ1lJjIdWgrharxfG49cDQL8SNeqXk4H4/V+n2BB9GjGjCOJcQrdUHmFZZRxnW4NzyvhC3ZCEgA7"),
  (character) => character.charCodeAt(0)
);

function jsonResponse(data: NoteResponse, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Note-Password",
  };
}

async function parseNoteRequest(
  req: Request,
  url: URL,
  bodyText: string
): Promise<NoteRequest> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as NoteRequest;
      if (!parsed.noteId) {
        parsed.noteId = extractPathNoteID(url.pathname);
      }
      return parsed;
    } catch {
      return {
        noteId: extractPathNoteID(url.pathname),
        content: bodyText,
      };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(bodyText);
    const text = params.get("text");
    const noteId = params.get("noteId");
    const password = params.get("password");

    if (text !== null || noteId !== null || password !== null) {
      return {
        noteId: noteId || extractPathNoteID(url.pathname),
        content: text || "",
        password: password || undefined,
      };
    }

    return {
      noteId: extractPathNoteID(url.pathname),
      content: bodyText,
    };
  }

  const queryNoteId = url.searchParams.get("noteId");
  return {
    noteId: queryNoteId || extractPathNoteID(url.pathname),
    content: bodyText,
  };
}

function textResponse(text: string, status: number = 200): Response {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderCurlHelp(baseURL: string): string {
  return [
    "Notejs - Lightweight note-taking app",
    `Version: ${APP_VERSION}`,
    "",
    "Usage Examples:",
    "===============",
    "",
    "# create new paste:",
    `echo "Hello World" | curl -sL --data-binary @- "${baseURL}"`,
    "",
    "# create new paste with file:",
    `curl -sL --data-binary @/path/to/file.txt "${baseURL}"`,
    "",
    "# create password-protected paste (burns after first correct read; use an 8+ character password):",
    `echo "Secret note" | curl -sL --data-binary @- -H "X-Note-Password: YOUR_NOTE_PASSWORD" "${baseURL}"`,
    "",
    "# read a password-protected paste once (replace NOTE_ID with the returned ID):",
    `curl -sL -H "X-Note-Password: YOUR_NOTE_PASSWORD" "${baseURL}noteid/NOTE_ID"`,
    "",
    `For more information and web interface, visit: ${baseURL}`,
    "",
  ].join("\n");
}

function getHeaderPassword(req: Request): string {
  return req.headers.get("x-note-password") || "";
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password is too long";
  }
  return null;
}

function isPasswordFailure(error: unknown): boolean {
  return error instanceof InvalidPasswordError;
}

function noteResponse(
  noteID: string,
  passwordProtected: boolean
): Response {
  return jsonResponse({ success: true, noteId: noteID, passwordProtected });
}

async function burnAndReturnPlainText(
  noteID: string,
  record: NonNullable<ReturnType<typeof parseProtectedNoteRecord>>,
  password: string,
  storage: Storage
): Promise<Response> {
  try {
    const content = await decryptProtectedNote(record, password);
    await storage.write(noteID, serializeProtectedNote(burnProtectedNote(record)));
    return textResponse(content);
  } catch (error) {
    if (isPasswordFailure(error)) {
      return textResponse("Incorrect password or note unavailable", 401);
    }
    throw error;
  }
}

async function handleGet(
  req: Request,
  url: URL,
  storage: Storage
): Promise<Response> {
  const noteID = extractNoteID(url);
  const ua = req.headers.get("user-agent") || "";
  const isHead = req.method === "HEAD";

  let rawValue = "";
  if (noteID) {
    rawValue = await storage.read(noteID);
  }

  const protectedRecord = rawValue
    ? parseProtectedNoteRecord(rawValue)
    : null;

  if (protectedRecord) {
    if (protectedRecord.state === "burned") {
      if (isCurlRequest(ua)) {
        return textResponse("Note not found", 404);
      }
      return new Response(renderHTML(noteID, "", { consumed: true }), {
        status: 410,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const password = getHeaderPassword(req);
    if (password && !isHead) {
      if (password.length > MAX_PASSWORD_LENGTH) {
        return textResponse("Password is too long", 400);
      }
      return burnAndReturnPlainText(noteID, protectedRecord, password, storage);
    }

    if (isCurlRequest(ua)) {
      return textResponse(
        "Password required. Send it in the X-Note-Password header.",
        401
      );
    }

    return new Response(
      renderHTML(noteID, "", { passwordProtected: true, locked: true }),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const content = rawValue;
  if (isCurlRequest(ua) && noteID) {
    if (!content) {
      return textResponse("Note not found", 404);
    }
    return textResponse(content);
  }

  if (isCurlRequest(ua) && !noteID) {
    return textResponse(renderCurlHelp(getBaseURL(req, url)));
  }

  const html = renderHTML(noteID, content, { showPasswordSetup: !noteID });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleUnlock(
  noteID: string,
  password: string,
  storage: Storage
): Promise<Response> {
  if (!validateNoteID(noteID)) {
    return jsonResponse({ success: false, error: "Invalid note ID format" }, 400);
  }

  if (!password) {
    return jsonResponse({ success: false, error: "Password required" }, 401);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return jsonResponse({ success: false, error: "Password is too long" }, 400);
  }

  const rawValue = await storage.read(noteID);
  const record = rawValue ? parseProtectedNoteRecord(rawValue) : null;
  if (!record || record.state !== "active") {
    return jsonResponse(
      { success: false, error: "Note not found or already read" },
      404
    );
  }

  try {
    const content = await decryptProtectedNote(record, password);
    await storage.write(noteID, serializeProtectedNote(burnProtectedNote(record)));
    return jsonResponse({
      success: true,
      noteId: noteID,
      content,
      passwordProtected: true,
    });
  } catch (error) {
    if (isPasswordFailure(error)) {
      return jsonResponse({ success: false, error: "Incorrect password" }, 401);
    }
    throw error;
  }
}

async function handlePost(
  req: Request,
  url: URL,
  storage: Storage
): Promise<Response> {
  const ua = req.headers.get("user-agent") || "";
  const contentType = req.headers.get("content-type") || "";
  const bodyText = await req.text();
  const noteReq = await parseNoteRequest(req, url, bodyText);
  const requestPassword = noteReq.password || getHeaderPassword(req);

  let noteID = noteReq.noteId?.trim() || "";
  if (noteReq.action === "unlock") {
    return handleUnlock(noteID, noteReq.password || "", storage);
  }

  if (!noteID) {
    noteID = generateNoteID();
  }

  if (!validateNoteID(noteID)) {
    return jsonResponse(
      { success: false, error: "Invalid note ID format" },
      400
    );
  }

  const content = noteReq.content || "";
  const trimmedContent = content.trim();
  const existingValue = await storage.read(noteID);
  const protectedRecord = existingValue
    ? parseProtectedNoteRecord(existingValue)
    : null;

  if (protectedRecord) {
    const password = requestPassword;
    if (!password) {
      return jsonResponse({ success: false, error: "Password required" }, 401);
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return jsonResponse({ success: false, error: "Password is too long" }, 400);
    }

    let passwordMatches = false;
    try {
      passwordMatches = await verifyProtectedNotePassword(protectedRecord, password);
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) {
      return jsonResponse({ success: false, error: "Incorrect password" }, 401);
    }

    if (!trimmedContent) {
      await storage.delete(noteID);
      return noteResponse(noteID, true);
    }

    const newPassword = noteReq.newPassword || password;
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return jsonResponse({ success: false, error: passwordError }, 400);
    }

    const updatedRecord = await encryptProtectedNote(content, newPassword);
    await storage.write(noteID, serializeProtectedNote(updatedRecord));
    return noteResponse(noteID, true);
  }

  if (existingValue && (requestPassword || noteReq.newPassword)) {
    return jsonResponse(
      {
        success: false,
        error: "Password protection can only be selected when creating a note",
      },
      400
    );
  }

  if (!trimmedContent) {
    await storage.delete(noteID);
  } else if (!existingValue && requestPassword) {
    const passwordError = validatePassword(requestPassword);
    if (passwordError) {
      return jsonResponse({ success: false, error: passwordError }, 400);
    }
    const protectedNewNote = await encryptProtectedNote(content, requestPassword);
    await storage.write(noteID, serializeProtectedNote(protectedNewNote));
  } else {
    // Existing plaintext notes stay plaintext; protection is selected only at creation.
    await storage.write(noteID, content);
  }

  if (isCurlRequest(ua)) {
    const base = getBaseURL(req, url);
    const fullURL = base + "noteid/" + noteID;
    return new Response(fullURL + "\n", {
      headers: {
        "Content-Type": "text/plain",
        ...corsHeaders(),
      },
    });
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new Response(`OK: ${noteID}\n`, {
      headers: {
        "Content-Type": "text/plain",
        ...corsHeaders(),
      },
    });
  }

  return noteResponse(
    noteID,
    !existingValue && Boolean(requestPassword) && Boolean(trimmedContent)
  );
}

function handleOptions(): Response {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

function handleFavicon(): Response {
  return new Response(FAVICON_BYTES, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function handleRequest(
  req: Request,
  storage: Storage
): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/favicon.ico") {
    return handleFavicon();
  }

  const method = req.method;

  if (method === "OPTIONS") {
    return handleOptions();
  }

  if (method === "GET" || method === "HEAD") {
    return handleGet(req, url, storage);
  }

  if (method === "POST") {
    return handlePost(req, url, storage);
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { "Content-Type": "text/plain" },
  });
}
