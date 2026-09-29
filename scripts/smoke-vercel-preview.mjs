import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const deploymentUrl = process.env.VERCEL_PREVIEW_URL;
if (!deploymentUrl) {
  throw new Error("VERCEL_PREVIEW_URL is required");
}

const validIdCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const suffix = Array.from(randomBytes(16), (byte) =>
  validIdCharacters[byte % validIdCharacters.length]
).join("");
const noteId = `CHECK${suffix}`;
const password = randomBytes(24).toString("base64url");
const content = "Vercel Preview protected-note smoke test";

function vercelCurl(path, args) {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "vercel@60.1.3",
      "curl",
      path,
      "--deployment",
      deploymentUrl,
      "--",
      "--silent",
      "--show-error",
      "--write-out",
      "\n%{http_code}",
      ...args,
    ],
    { encoding: "utf8", timeout: 60_000 }
  );

  if (result.error || result.status !== 0) {
    throw new Error(`vercel curl failed for ${path}: ${result.stderr || result.error}`);
  }

  const output = result.stdout.trimEnd();
  const separator = output.lastIndexOf("\n");
  if (separator < 0) {
    throw new Error(`vercel curl returned no HTTP status for ${path}`);
  }
  return {
    body: output.slice(0, separator),
    status: Number(output.slice(separator + 1).trim()),
  };
}

const created = vercelCurl("/", [
  "--request",
  "POST",
  "--header",
  "Content-Type: application/json",
  "--data-binary",
  JSON.stringify({ noteId, content, password }),
]);
if (created.status !== 200) {
  throw new Error(`protected-note creation returned HTTP ${created.status}`);
}

const wrongPassword = vercelCurl(`/noteid/${noteId}`, [
  "--header",
  "X-Note-Password: wrong-smoke-password",
]);
if (wrongPassword.status !== 401) {
  throw new Error(`wrong password returned HTTP ${wrongPassword.status}, expected 401`);
}

const firstRead = vercelCurl(`/noteid/${noteId}`, [
  "--header",
  `X-Note-Password: ${password}`,
]);
if (firstRead.status !== 200 || !firstRead.body.trimEnd().endsWith(content)) {
  throw new Error(`correct password read failed with HTTP ${firstRead.status}`);
}

const secondRead = vercelCurl(`/noteid/${noteId}`, [
  "--header",
  `X-Note-Password: ${password}`,
]);
if (secondRead.status !== 404 && secondRead.status !== 410) {
  throw new Error(`second read returned HTTP ${secondRead.status}, expected 404 or 410`);
}

console.log("Vercel Preview password-protected note smoke test passed.");
