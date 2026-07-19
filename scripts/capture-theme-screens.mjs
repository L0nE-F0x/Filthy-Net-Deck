/**
 * Capture full-window screenshots of Filthy Net Deck for each planeswalker skin.
 * Uses localStorage prefs (bbi.prefs) so skins match the real app.
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const OUT = path.join(os.homedir(), "Desktop", "FND-cinematic", "screenshots");
const BASE = process.env.FND_URL || "http://localhost:1420";
const VIEW = { width: 1600, height: 900 };

const SKINS = [
  { id: "classic", name: "Classic" },
  { id: "chandra", name: "Chandra" },
  { id: "teferi", name: "Teferi" },
  { id: "liliana", name: "Liliana" },
  { id: "ajani", name: "Ajani" },
  { id: "elspeth", name: "Elspeth" },
];

function prefs(skin) {
  return JSON.stringify({
    theme: "dark",
    skin,
    defaultMode: "bo1",
    notifyArenaEve: false,
    notifyMatchEnd: false,
    notifyBanlist: false,
    fullscreen: false,
  });
}

async function waitForApp(page) {
  // Splash min 1600ms + fade; meta boot can take longer
  await page.waitForSelector(".app-shell, .splash-root", { timeout: 60000 });
  // Wait until splash is gone
  for (let i = 0; i < 60; i++) {
    const gone = await page.evaluate(() => !document.querySelector(".splash-root"));
    if (gone) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
}

async function captureSkin(page, skin, openThemes) {
  await page.addInitScript((p) => {
    localStorage.setItem("bbi.prefs", p);
  }, prefs(skin.id));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 90000 });
  await waitForApp(page);

  // Force appearance in case boot raced
  await page.evaluate((id) => {
    const root = document.documentElement;
    root.removeAttribute("data-theme");
    if (id === "classic") root.removeAttribute("data-skin");
    else root.setAttribute("data-skin", id);
  }, skin.id);

  await page.waitForTimeout(400);

  if (openThemes) {
    // Open Themes accordion in sidebar
    const btn = page.locator(".pw-themes-btn");
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  }

  const file = path.join(OUT, `${skin.id}${openThemes ? "-themes-open" : ""}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Full app chrome for each skin
  for (const skin of SKINS) {
    await captureSkin(page, skin, false);
  }
  // Themes menu open on a couple skins for feature proof
  await captureSkin(page, SKINS.find((s) => s.id === "chandra"), true);
  await captureSkin(page, SKINS.find((s) => s.id === "liliana"), true);
  await captureSkin(page, SKINS.find((s) => s.id === "classic"), true);

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
