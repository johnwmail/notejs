import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const deploymentUrl = process.env.VERCEL_PREVIEW_URL;
if (!deploymentUrl) {
  throw new Error("VERCEL_PREVIEW_URL is required");
}
const protectionBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!protectionBypassSecret) {
  console.log(
    "Skipping protected-note curl smoke test: VERCEL_AUTOMATION_BYPASS_SECRET is not configured."
  );
  process.exit(0);
}

const validIdCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const suffix = Array.from(randomBytes(16), (byte) =>
  validIdCharacters[byte % validIdCharacters.length]
).join("");
const noteId = `CHECK${suffix}`;
const password = randomBytes(24).toString("base64url");
const content = "Vercel Preview protected-note smoke test";

function curl(path, args) {
  const result = spawnSync("curl", [
    "--silent",
    "--show-error",
    "--max-time",
    "30",
    "--write-out",
    "\n%{http_code}",
    "--header",
    `x-vercel-protection-bypass: ${protectionBypassSecret}`,
    ...args,
    `${deploymentUrl}${path}`,
  ], { encoding: "utf8", timeout: 60_000 });

  if (result.error || result.status !== 0) {
    throw new Error(`curl failed for ${path}: ${result.stderr || result.error}`);
  }

  const output = result.stdout.trimEnd();
  const separator = output.lastIndexOf("\n");
  if (separator < 0) {
    throw new Error(`curl returned no HTTP status for ${path}`);
  }
  return {
    body: output.slice(0, separator),
    status: Number(output.slice(separator + 1).trim()),
  };
}

const created = curl("/", [
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

const wrongPassword = curl(`/noteid/${noteId}`, [
  "--header",
  "X-Note-Password: wrong-smoke-password",
]);
if (wrongPassword.status !== 401) {
  throw new Error(`wrong password returned HTTP ${wrongPassword.status}, expected 401`);
}

const firstRead = curl(`/noteid/${noteId}`, [
  "--header",
  `X-Note-Password: ${password}`,
]);
if (firstRead.status !== 200 || !firstRead.body.trimEnd().endsWith(content)) {
  throw new Error(`correct password read failed with HTTP ${firstRead.status}`);
}

const secondRead = curl(`/noteid/${noteId}`, [
  "--header",
  `X-Note-Password: ${password}`,
]);
if (secondRead.status !== 404 && secondRead.status !== 410) {
  throw new Error(`second read returned HTTP ${secondRead.status}, expected 404 or 410`);
}

console.log("Vercel Preview curl password-protection smoke test passed.");
