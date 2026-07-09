/* Filthy Net Deck marketing site */

const cardCache = new Map();

async function resolveScryfallImage(name) {
  const key = name.toLowerCase();
  if (cardCache.has(key)) return cardCache.get(key);
  try {
    let res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
        { headers: { Accept: "application/json" } },
      );
    }
    if (!res.ok) {
      cardCache.set(key, null);
      return null;
    }
    const data = await res.json();
    const uri =
      data.image_uris?.normal ||
      data.image_uris?.art_crop ||
      data.card_faces?.[0]?.image_uris?.normal ||
      null;
    cardCache.set(key, uri);
    return uri;
  } catch {
    cardCache.set(key, null);
    return null;
  }
}

/** Used by onerror attributes on mock card imgs */
window.__fndCard = function (img) {
  const name = img.getAttribute("data-card");
  if (!name) return;
  void resolveScryfallImage(name).then((uri) => {
    if (uri) {
      img.onerror = null;
      img.src = uri;
    }
  });
};

async function hydrateCardImages() {
  const imgs = document.querySelectorAll("img[data-card]");
  // sequential-ish with small concurrency
  const list = [...imgs];
  for (const img of list) {
    const name = img.getAttribute("data-card");
    if (!name) continue;
    const uri = await resolveScryfallImage(name);
    if (uri) {
      img.src = uri;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
}

function setupReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

function setupNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle("scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

async function loadLiveMeta() {
  const host = document.getElementById("meta-list");
  if (!host) return;
  try {
    const res = await fetch("/meta/latest.json", { cache: "no-cache" });
    if (!res.ok) return;
    const meta = await res.json();
    const std = meta.formats?.find((f) => f.id === "standard" || f.featured);
    if (!std) return;
    const mode = std.bo1DeckIds?.length ? "bo1DeckIds" : "bo3DeckIds";
    const ids = std[mode] || [];
    const rows = ids
      .slice(0, 6)
      .map((id, i) => {
        const d = meta.decks?.[id];
        if (!d) return null;
        const pct = d.metaShare ?? 0;
        const max = Math.max(
          ...ids.map((x) => meta.decks?.[x]?.metaShare ?? 0),
          1,
        );
        const p = Math.round((pct / max) * 100);
        return `<div class="meta-row"><b>#${d.rank ?? i + 1}</b><span>${escapeHtml(d.name)}</span><i style="--p:${p}%"></i><em>${pct ? pct + "%" : "—"}</em></div>`;
      })
      .filter(Boolean);
    if (rows.length) host.innerHTML = rows.join("");
  } catch {
    /* keep static fallback */
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupParallax() {
  const stage = document.querySelector(".hero-stage");
  if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  window.addEventListener(
    "mousemove",
    (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 6;
      stage.style.transform = `translate3d(${x * -0.4}px, ${y * -0.4}px, 0)`;
    },
    { passive: true },
  );
}

document.addEventListener("DOMContentLoaded", () => {
  setupReveal();
  setupNav();
  setupParallax();
  void hydrateCardImages();
  void loadLiveMeta();
});
