/**
 * Refresh the premier-event spotlight.
 *
 *   node pipeline/build-spotlight.mjs
 *   node pipeline/build-spotlight.mjs --force
 *
 * The hourly job runs this with no flag. Outside the live window (`starts`
 * through the UTC day after `ends`) it exits 0 without fetching or writing.
 * `--force` also refreshes during the showcase week. A timestamp-only change
 * is not a write: standings and lists have to differ. Refuses to overwrite a
 * good file when an in-window event comes back with too few lists, and never
 * replaces a file with an empty event.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSpotlightFeed,
  sameSpotlightPayload,
  selectCalendarEntry,
  selectLiveEntry,
  SPOTLIGHT_CALENDAR,
  utcDay,
} from "./sources/spotlight.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN_LISTS = 40;
const OUT = ["public/spotlight.json", "website/spotlight.json"];
const force = process.argv.includes("--force");

const day = utcDay();
const live = selectLiveEntry(SPOTLIGHT_CALENDAR, day);
const open = selectCalendarEntry(SPOTLIGHT_CALENDAR, day);
if (!live && !(force && open)) {
  console.log(`spotlight: no live event on ${day} — not fetching, files left in place`);
  process.exit(0);
}

const feed = await buildSpotlightFeed();
if (!feed.event) {
  console.log("spotlight: empty feed — not writing");
  process.exit(0);
}
if (feed.event.decks.length < MIN_LISTS) {
  console.error(
    `spotlight: ${feed.event.name} produced ${feed.event.decks.length} lists (< ${MIN_LISTS}). Not writing.`,
  );
  process.exit(1);
}

const unchanged = OUT.every((rel) => {
  try {
    const prev = JSON.parse(readFileSync(join(root, rel), "utf8"));
    return sameSpotlightPayload(prev, feed);
  } catch {
    return false;
  }
});
if (unchanged) {
  console.log(
    `spotlight: ${feed.event.name} unchanged after round ${feed.event.standingsRound ?? "—"} (ignoring generatedAt) — not writing`,
  );
  process.exit(0);
}

const text = `${JSON.stringify(feed, null, 2)}\n`;
for (const rel of OUT) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${rel} (${text.length} bytes)`);
}
