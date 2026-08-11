/**
 * Every internal link in the generated meta site must resolve to a file that
 * exists.
 *
 * This exists because the pages are nested at two depths — `meta-web/deck/x`
 * and `meta-web/card/x` — and `layout()` writes nav links relative to the top
 * level, so each nested builder has to rewrite them. Adding a single nav entry
 * ("Cards") silently broke 32 deck pages that way, and nothing would have
 * caught it: the build succeeds, the pages render, and only a crawler notices.
 *
 * Crawlability is the entire point of this corpus (Phase 1 item C), so a dead
 * internal link is a real defect, not cosmetic.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = join(root, "website", "meta-web");

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

describe("generated meta site", () => {
  const built = existsSync(SITE_DIR);

  it.skipIf(!built)("has no broken internal links", () => {
    const files = htmlFiles(SITE_DIR);
    expect(files.length).toBeGreaterThan(10);

    const broken = [];
    let checked = 0;
    for (const file of files) {
      const html = readFileSync(file, "utf8");
      // Local .html targets only: external URLs and anchors are not ours to
      // verify, and the download links deliberately point outside meta-web.
      for (const m of html.matchAll(/href="([^"#:]+\.html)(?:#[^"]*)?"/g)) {
        checked++;
        const target = resolve(dirname(file), m[1]);
        if (!existsSync(target)) {
          broken.push(`${file.slice(root.length + 1)} -> ${m[1]}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(broken).toEqual([]);
  });

  it.skipIf(!built)("keeps every card page reachable from the card index", () => {
    // 300+ pages nothing links to would be an orphan corpus — worse than no
    // corpus, because it looks like coverage in the sitemap and earns nothing.
    const indexPath = join(SITE_DIR, "cards.html");
    expect(existsSync(indexPath)).toBe(true);
    const index = readFileSync(indexPath, "utf8");
    const linked = new Set(
      [...index.matchAll(/href="card\/([^"]+)\.html"/g)].map((m) => m[1]),
    );
    const cardDir = join(SITE_DIR, "card");
    const onDisk = existsSync(cardDir)
      ? readdirSync(cardDir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5))
      : [];
    expect(onDisk.length).toBeGreaterThan(50);
    const orphans = onDisk.filter((slug) => !linked.has(slug));
    expect(orphans).toEqual([]);
  });
});
