import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8")
);
const appVersion =
  process.env.APP_VERSION ||
  process.env.GITHUB_SHA?.slice(0, 7) ||
  `v${packageMetadata.version}`;

writeFileSync(
  resolve(projectRoot, "src/lib/version.ts"),
  `export const APP_VERSION = ${JSON.stringify(appVersion)};\n`
);
