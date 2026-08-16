/* Hero fan — live Standard/Pioneer × Bo1/Bo3 from /meta/latest.json */

const FORMATS = ["standard", "pioneer"];
const MODES = ["bo1", "bo3"];

function emptyBoards() {
  return {
    standard: { bo1: [], bo3: [] },
    pioneer: { bo1: [], bo3: [] },
  };
}

function scryfallCard(id) {
  if (!id || id.length < 3) return "";
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function isLand(c) {
  const t = String(c?.type || "").toLowerCase();
  return !t || t.includes("land");
}

function signatureFrom(cards) {
  const pool = [...(cards || [])].filter((c) => c.scryfallId && !isLand(c));
  pool.sort((a, b) => (b.count || 0) - (a.count || 0));
  return pool[0] || (cards || []).find((c) => c.scryfallId) || null;
}

function signatureCard(deck) {
  return signatureFrom(deck.mainboard);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function packFormat(meta, fmtId, mode) {
  const fmt = meta.formats?.find((f) => f.id === fmtId);
  if (!fmt) return [];
  const key = mode === "bo3" ? "bo3DeckIds" : "bo1DeckIds";
  const ids = fmt[key] || [];
  return ids
    .map((id) => meta.decks?.[id])
    .filter(Boolean)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      name: d.name,
      rank: d.rank,
      share: d.metaShare,
      format: fmtId,
      mode,
      sbCount: (d.sideboard || []).reduce((n, c) => n + (c.count || 0), 0),
      card: signatureCard(d),
    }))
    .filter((d) => d.card?.scryfallId);
}

function sameFaces(a, b) {
  if (!a?.length || a.length !== b?.length) return false;
  return a.every((d, i) => d.card?.scryfallId && d.card.scryfallId === b[i]?.card?.scryfallId);
}

async function loadBoards() {
  const empty = emptyBoards();
  try {
    const res = await fetch("/meta/latest.json", { cache: "no-cache" });
    if (!res.ok) return empty;
    const meta = await res.json();
    const boards = emptyBoards();
    for (const fmt of FORMATS) {
      for (const mode of MODES) {
        boards[fmt][mode] = packFormat(meta, fmt, mode);
      }
    }
    return boards;
  } catch {
    return empty;
  }
}

function pickInitial(boards) {
  for (const mode of MODES) {
    for (const fmt of FORMATS) {
      if (boards[fmt]?.[mode]?.length) return { format: fmt, mode };
    }
  }
  return { format: "standard", mode: "bo1" };
}

function layout(i, active) {
  const d = i - active;
  const lift = d === 0;
  const ang = d * 15;
  return {
    x: d * 78,
    y: lift ? -52 : 18 + Math.abs(d) * 12,
    rz: ang,
    s: lift ? 1.1 : 0.9,
  };
}

function setupFan(boards) {
  const stage = document.getElementById("hero-stage");
  const hand = document.getElementById("fan-hand");
  const dots = document.getElementById("fan-dots");
  const dockEl = document.getElementById("fan-dock");
  if (!stage || !hand) return;

  const start = pickInitial(boards);
  let format = start.format;
  let mode = start.mode;
  let decks = boards[format]?.[mode] || [];
  let cards = [];
  let active = 0;
  let timer = 0;
  let paused = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function currentBoard() {
    return boards[format]?.[mode] || [];
  }

  function hasBoard(fmt, m) {
    return (boards[fmt]?.[m] || []).length > 0;
  }

  function dock(d) {
    if (!d) return;
    const rank = document.getElementById("fan-rank");
    const name = document.getElementById("fan-name");
    const metaEl = document.getElementById("fan-meta");
    const go = document.getElementById("fan-go");
    const fmtLabel = d.format === "pioneer" ? "Pioneer" : "Standard";
    const modeLabel = d.mode === "bo3" ? "Bo3" : "Bo1";
    if (rank) rank.textContent = `#${d.rank ?? ""}`;
    if (name) name.textContent = d.name;
    if (metaEl) {
      const share = d.share != null ? `${d.share}%` : "verified";
      const sb =
        d.mode === "bo3" && d.sbCount
          ? ` · ${d.sbCount}-card SB`
          : "";
      metaEl.textContent = `${fmtLabel} ${modeLabel} · ${share}${sb}`;
    }
    if (go) go.href = d.id ? `meta-web/deck/${d.id}.html` : "meta-web/";
  }

  function flashDock() {
    if (!dockEl) return;
    dockEl.classList.remove("is-flash");
    void dockEl.offsetWidth;
    dockEl.classList.add("is-flash");
    window.setTimeout(() => dockEl.classList.remove("is-flash"), 450);
  }

  function syncToggles() {
    document.querySelectorAll("[data-fan-fmt]").forEach((b) => {
      const on = b.dataset.fanFmt === format;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.disabled = !hasBoard(b.dataset.fanFmt, mode);
    });
    document.querySelectorAll("[data-fan-mode]").forEach((b) => {
      const on = b.dataset.fanMode === mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.disabled = !hasBoard(format, b.dataset.fanMode);
    });
  }

  function render() {
    cards.forEach((el, i) => {
      const p = layout(i, active);
      el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) rotate(${p.rz}deg) scale(${p.s})`;
      el.style.zIndex = String(10 + cards.length - Math.abs(i - active));
      el.classList.toggle("is-up", i === active);
    });
    if (dots) {
      [...dots.children].forEach((dot, i) => dot.classList.toggle("on", i === active));
    }
    dock(decks[active]);
  }

  function restart() {
    window.clearInterval(timer);
    if (reduced || paused || cards.length < 2) return;
    timer = window.setInterval(() => go(active + 1), 4500);
  }

  function go(i) {
    if (!cards.length) return;
    active = ((i % cards.length) + cards.length) % cards.length;
    render();
    restart();
  }

  function bindCards() {
    cards.forEach((el, i) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (i === active) {
          const href = document.getElementById("fan-go")?.getAttribute("href");
          if (href) window.location.href = href;
          return;
        }
        go(i);
      });
    });
  }

  function paint({ flash = false } = {}) {
    decks = currentBoard();
    if (!decks.length) {
      const next = pickInitial(boards);
      format = next.format;
      mode = next.mode;
      decks = currentBoard();
    }
    hand.innerHTML = decks
      .map((d, i) => {
        const src = scryfallCard(d.card.scryfallId);
        return `<button type="button" class="fan-card" data-i="${i}" aria-label="${escapeHtml(d.name)}">
          <img src="${src}" alt="${escapeHtml(d.card.name)}" width="172" height="240" />
        </button>`;
      })
      .join("");
    if (dots) {
      dots.innerHTML = decks
        .map((_, i) => `<button type="button" class="hero-dot" data-i="${i}" aria-label="Deck ${i + 1}"></button>`)
        .join("");
    }
    cards = [...hand.querySelectorAll(".fan-card")];
    active = 0;
    bindCards();
    syncToggles();
    render();
    restart();
    if (flash) flashDock();
  }

  function switchBoard(nextFmt, nextMode) {
    if (!hasBoard(nextFmt, nextMode)) return;
    if (nextFmt === format && nextMode === mode) return;
    const prev = currentBoard();
    format = nextFmt;
    mode = nextMode;
    const next = currentBoard();
    paint({ flash: sameFaces(prev, next) });
  }

  document.querySelectorAll("[data-fan-fmt]").forEach((b) => {
    b.addEventListener("click", () => switchBoard(b.dataset.fanFmt, mode));
  });
  document.querySelectorAll("[data-fan-mode]").forEach((b) => {
    b.addEventListener("click", () => switchBoard(format, b.dataset.fanMode));
  });

  dots?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) go(Number(b.dataset.i));
  });
  stage.querySelector("[data-fan-prev]")?.addEventListener("click", () => go(active - 1));
  stage.querySelector("[data-fan-next]")?.addEventListener("click", () => go(active + 1));
  stage.addEventListener("mouseenter", () => {
    paused = true;
    window.clearInterval(timer);
  });
  stage.addEventListener("mouseleave", () => {
    paused = false;
    restart();
  });
  stage.tabIndex = 0;
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(active - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(active + 1);
    }
  });

  paint();
}

document.addEventListener("DOMContentLoaded", async () => {
  const boards = await loadBoards();
  setupFan(boards);
});
