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

function jsonResponse(data: NoteResponse, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      return { noteId: extractPathNoteID(url.pathname), content: bodyText };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(bodyText);
    const text = params.get("text");
    const noteId = params.get("noteId");

    if (text !== null || noteId !== null) {
      return {
        noteId: noteId || extractPathNoteID(url.pathname),
        content: text || "",
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

async function handleGet(
  req: Request,
  url: URL,
  storage: Storage
): Promise<Response> {
  const noteID = extractNoteID(url);
  const ua = req.headers.get("user-agent") || "";

  let content = "";
  if (noteID) {
    content = await storage.read(noteID);
  }

  if (isCurlRequest(ua) && noteID) {
    if (!content) {
      return new Response("Note not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const html = renderHTML(noteID, content);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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

  let noteID = noteReq.noteId?.trim() || "";
  if (!noteID) {
    noteID = generateNoteID();
  }

  if (!validateNoteID(noteID)) {
    return jsonResponse(
      { success: false, error: "Invalid note ID format" },
      400
    );
  }

  const trimmedContent = noteReq.content.trim();
  if (!trimmedContent) {
    await storage.delete(noteID);
  } else {
    await storage.write(noteID, noteReq.content);
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

  return jsonResponse({ success: true, noteId: noteID });
}

function handleOptions(): Response {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

function handleFavicon(): Response {
  return new Response(null, {
    status: 204,
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
