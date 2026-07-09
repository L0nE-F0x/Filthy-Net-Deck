/**
 * Export TypeScript seedMeta to JSON via tsx, then refresh website/public meta.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const r = spawnSync("npx", ["tsx", "pipeline/export-seed-run.ts"], {
  cwd: root,
  encoding: "utf8",
  shell: true,
});

if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}
console.log(r.stdout);

const build = spawnSync(process.execPath, [join(__dirname, "build-meta.mjs"), "--seed"], {
  cwd: root,
  encoding: "utf8",
});
console.log(build.stdout);
if (build.status !== 0) {
  console.error(build.stderr);
  process.exit(build.status ?? 1);
}
