import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const lockfilePath = resolve(root, "pnpm-lock.yaml");
const denylistPath = resolve(root, "security/mastra-june-2026-denylist.json");

const lockfile = readFileSync(lockfilePath, "utf8");
const denylist = JSON.parse(readFileSync(denylistPath, "utf8"));

const hits = denylist.filter((entry) => {
  const separator = entry.lastIndexOf("@");
  const name = entry.slice(0, separator);
  const version = entry.slice(separator + 1);
  return (
    lockfile.includes(`${name}@${version}:`) ||
    lockfile.includes(`${name}@${version}(`)
  );
});

if (lockfile.includes("easy-day-js")) {
  hits.push("easy-day-js@ANY");
}

if (hits.length > 0) {
  console.error(`Blocked compromised dependency versions:\n${[...new Set(hits)].join("\n")}`);
  process.exit(1);
}

const selected = ["@mastra/core@1.61.0", "@mastra/ai-sdk@1.9.1"];
const missing = selected.filter(
  (entry) => !lockfile.includes(`${entry}:`) && !lockfile.includes(`${entry}(`),
);

if (missing.length > 0) {
  console.error(`Pinned Mastra packages missing from lockfile:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log(`Supply-chain denylist clean (${denylist.length} known-bad versions checked).`);
