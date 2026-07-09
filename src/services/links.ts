const ALLOWED_HOSTS = [
  "mtggoldfish.com",
  "www.mtggoldfish.com",
  "melee.gg",
  "www.melee.gg",
  "mtga.untapped.gg",
  "untapped.gg",
  "magic.wizards.com",
  "scryfall.com",
  "api.scryfall.com",
  "aetherhub.com",
  "www.aetherhub.com",
  "mtgdecks.net",
  "www.mtgdecks.net",
  "filthy-net-deck.netlify.app",
  "banbasicisland.netlify.app",
  "github.com",
  "www.github.com",
];

export function isHealthyUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Placeholder / dead patterns we used to ship */
export function isBrokenPlaceholder(url: string): boolean {
  return (
    /mtggoldfish\.com\/tournament\/?$/i.test(url) ||
    /tournament\/$/i.test(url) ||
    url.includes("example.com") ||
    url.includes("localhost")
  );
}

export function canShowResultsLink(url: string | undefined | null): boolean {
  return isHealthyUrl(url) && !isBrokenPlaceholder(url ?? "");
}
