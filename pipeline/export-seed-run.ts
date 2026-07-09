import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedMeta } from "../src/data/seedMeta";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "seed-export.json");
writeFileSync(out, JSON.stringify(seedMeta, null, 2));
console.log("Exported", Object.keys(seedMeta.decks).length, "decks to", out);
