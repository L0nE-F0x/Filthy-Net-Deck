/* Filthy Net Deck marketing site */

const cardCache = new Map();

async function resolveScryfallImage(name) {
  const key = name.toLowerCase();
  if (cardCache.has(key)) return cardCache.get(key);
  try {
    // Exact only — same policy as the app: never render a fuzzy-matched wrong card.
    const res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
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

function scryfallArt(id) {
  if (!id || id.length < 3) return "";
  return `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function isLandCard(c) {
  const t = String(c?.type || "").toLowerCase();
  return !t || t.includes("land");
}

function artCards(deck, n = 4) {
  const pool = [...(deck?.mainboard || [])];
  return pool
    .filter((c) => c.scryfallId && !isLandCard(c))
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, n);
}

function artImgs(deck, n, cls) {
  return artCards(deck, n)
    .map((c) => {
      const src = scryfallArt(c.scryfallId);
      return src ? `<img src="${src}" alt="" loading="lazy" class="${cls || ""}" />` : "";
    })
    .join("");
}

function metaRowsHtml(meta, ids, limit) {
  const max = Math.max(
    ...ids.map((x) => meta.decks?.[x]?.metaShare ?? 0),
    1,
  );
  return ids
    .slice(0, limit)
    .map((id, i) => {
      const d = meta.decks?.[id];
      if (!d) return null;
      const pct = d.metaShare ?? 0;
      const p = Math.round((pct / max) * 100);
      const thumb = artCards(d, 1)[0];
      const img = thumb
        ? `<img class="meta-thumb" src="${scryfallArt(thumb.scryfallId)}" alt="" />`
        : "";
      return `<div class="meta-row">${img}<b>#${d.rank ?? i + 1}</b><span>${escapeHtml(d.name)}</span><i style="--p:${p}%"></i><em>${pct ? pct + "%" : "—"}</em></div>`;
    })
    .filter(Boolean);
}

function paintDecksBoard(meta, ids) {
  const decks = ids.map((id) => meta.decks?.[id]).filter(Boolean);
  if (!decks.length) return;
  const top = decks[0];
  const banner = document.getElementById("hero-deck-banner");
  if (banner) {
    const pct = top.metaShare != null ? `${top.metaShare}% of the meta` : "";
    banner.querySelector("small").textContent = `Standard · Bo1 · #${top.rank ?? 1}`;
    banner.querySelector("strong").textContent = top.name;
    banner.querySelector("span").textContent = pct;
    const arts = banner.querySelector("[data-hero-arts]");
    if (arts) arts.innerHTML = artImgs(top, 4);
  }
  const tiles = document.getElementById("hero-deck-tiles");
  if (tiles) {
    tiles.innerHTML = decks
      .slice(1, 5)
      .map(
        (d) => `<div class="app-tile">
          <strong>${escapeHtml(d.name)}</strong>
          <em>#${d.rank ?? ""} · ${d.metaShare != null ? d.metaShare + "%" : ""}</em>
          <div class="app-tile-arts">${artImgs(d, 3)}</div>
        </div>`,
      )
      .join("");
  }
}

function paintMetaStack(meta, ids) {
  const host = document.getElementById("meta-art-stack");
  if (!host) return;
  const names = [];
  for (const id of ids.slice(0, 4)) {
    const d = meta.decks?.[id];
    const card = artCards(d, 1)[0];
    if (card?.name) names.push(card.name);
  }
  const imgs = [...host.querySelectorAll("img")];
  imgs.forEach((img, i) => {
    if (names[i]) {
      img.setAttribute("data-card", names[i]);
      img.alt = names[i];
    }
  });
}

async function loadLiveMeta() {
  const host = document.getElementById("meta-list");
  try {
    const res = await fetch("/meta/latest.json", { cache: "no-cache" });
    if (!res.ok) return;
    const meta = await res.json();
    const std = meta.formats?.find((f) => f.id === "standard" || f.featured);
    if (!std) return;
    const mode = std.bo1DeckIds?.length ? "bo1DeckIds" : "bo3DeckIds";
    const ids = std[mode] || [];
    const full = metaRowsHtml(meta, ids, 6);
    if (host && full.length) host.innerHTML = full.join("");
    paintDecksBoard(meta, ids);
    paintMetaStack(meta, ids);
    void hydrateCardImages();
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

function setupHeroOrbit() {
  const stage = document.getElementById("hero-stage");
  if (!stage) return;

  const cards = [...stage.querySelectorAll(".orbit-card")];
  if (!cards.length) return;

  const orbit = stage.querySelector(".hero-orbit");
  const dotsHost = stage.querySelector(".hero-dots");
  const prev = stage.querySelector("[data-orbit-prev]");
  const next = stage.querySelector("[data-orbit-next]");
  const live = stage.querySelector("[data-orbit-live]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = cards.findIndex((c) => c.dataset.role === "active");
  if (index < 0) index = 0;
  let timer = 0;
  let paused = false;

  function roleFor(offset) {
    if (offset === 0) return "active";
    if (offset === -1) return "left";
    if (offset === 1) return "right";
    if (offset === -2) return "back-left";
    return "back-right";
  }

  function wrapOffset(j, active, n) {
    let d = j - active;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  function render() {
    const n = cards.length;
    cards.forEach((card, j) => {
      const role = roleFor(wrapOffset(j, index, n));
      card.dataset.role = role;
      card.classList.toggle("is-active", role === "active");
      card.setAttribute("aria-hidden", role === "active" ? "false" : "true");
    });
    if (dotsHost) {
      [...dotsHost.children].forEach((dot, i) => {
        const on = i === index;
        dot.classList.toggle("on", on);
        dot.setAttribute("aria-current", on ? "true" : "false");
      });
    }
    if (live) live.textContent = cards[index].dataset.label || "";
  }

  function restart() {
    window.clearInterval(timer);
    if (reduced || paused) return;
    timer = window.setInterval(() => go(index + 1), 5600);
  }

  function go(i) {
    const n = cards.length;
    index = ((i % n) + n) % n;
    render();
    restart();
  }

  if (dotsHost && !dotsHost.children.length) {
    cards.forEach((card, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hero-dot";
      btn.setAttribute("aria-label", `Show ${card.dataset.label || `card ${i + 1}`}`);
      btn.addEventListener("click", () => go(i));
      dotsHost.appendChild(btn);
    });
  }

  function openCard(card) {
    const href = card.dataset.href;
    if (!href) return;
    if (href.startsWith("#")) {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = href;
    }
  }

  cards.forEach((card, i) => {
    card.addEventListener("click", (e) => {
      if (i !== index) {
        e.preventDefault();
        go(i);
        return;
      }
      openCard(card);
    });
  });
  prev?.addEventListener("click", () => go(index - 1));
  next?.addEventListener("click", () => go(index + 1));

  stage.addEventListener("mouseenter", () => {
    paused = true;
    window.clearInterval(timer);
  });
  stage.addEventListener("mouseleave", () => {
    paused = false;
    restart();
  });
  stage.addEventListener("focusin", () => {
    paused = true;
    window.clearInterval(timer);
  });
  stage.addEventListener("focusout", (e) => {
    if (stage.contains(e.relatedTarget)) return;
    paused = false;
    restart();
  });
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    }
  });
  stage.tabIndex = 0;

  let touchX = 0;
  stage.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0]?.clientX ?? 0;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      const x = e.changedTouches[0]?.clientX ?? touchX;
      const dx = x - touchX;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );

  if (!reduced && orbit) {
    window.addEventListener(
      "mousemove",
      (e) => {
        const r = stage.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 2.2;
        const y = ((e.clientY - r.top) / r.height - 0.5) * -1.6;
        orbit.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`;
      },
      { passive: true },
    );
  }

  render();
  restart();
}

document.addEventListener("DOMContentLoaded", () => {
  setupReveal();
  setupNav();
  setupHeroOrbit();
  void hydrateCardImages();
  void loadLiveMeta();
});
