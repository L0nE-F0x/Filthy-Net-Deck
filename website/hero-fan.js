/* Hero fan — live Standard + Pioneer Bo1 from /meta/latest.json */

function scryfallCard(id) {
  if (!id || id.length < 3) return "";
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function isLand(c) {
  const t = String(c?.type || "").toLowerCase();
  return !t || t.includes("land");
}

function signatureCard(deck) {
  const pool = [...(deck.mainboard || [])].filter((c) => c.scryfallId && !isLand(c));
  pool.sort((a, b) => (b.count || 0) - (a.count || 0));
  return pool[0] || (deck.mainboard || []).find((c) => c.scryfallId) || null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function packFormat(meta, fmtId) {
  const fmt = meta.formats?.find((f) => f.id === fmtId);
  if (!fmt) return [];
  const ids = fmt.bo1DeckIds?.length ? fmt.bo1DeckIds : fmt.bo3DeckIds || [];
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
      card: signatureCard(d),
    }))
    .filter((d) => d.card?.scryfallId);
}

async function loadBoards() {
  const empty = { standard: [], pioneer: [] };
  try {
    const res = await fetch("/meta/latest.json", { cache: "no-cache" });
    if (!res.ok) return empty;
    const meta = await res.json();
    return {
      standard: packFormat(meta, "standard"),
      pioneer: packFormat(meta, "pioneer"),
    };
  } catch {
    return empty;
  }
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
  if (!stage || !hand) return;

  let format = boards.standard.length ? "standard" : "pioneer";
  let decks = boards[format] || [];
  let cards = [];
  let active = 0;
  let timer = 0;
  let paused = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dock(d) {
    if (!d) return;
    const rank = document.getElementById("fan-rank");
    const name = document.getElementById("fan-name");
    const metaEl = document.getElementById("fan-meta");
    const go = document.getElementById("fan-go");
    const fmtLabel = d.format === "pioneer" ? "Pioneer" : "Standard";
    if (rank) rank.textContent = `#${d.rank ?? ""}`;
    if (name) name.textContent = d.name;
    if (metaEl) {
      const share = d.share != null ? `${d.share}%` : "verified";
      metaEl.textContent = `${fmtLabel} Bo1 · ${share}`;
    }
    if (go) go.href = d.id ? `meta-web/deck/${d.id}.html` : "meta-web/";
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

  function paint() {
    decks = boards[format] || [];
    if (!decks.length) {
      const other = format === "standard" ? "pioneer" : "standard";
      if (boards[other]?.length) {
        format = other;
        decks = boards[format];
      }
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
    document.querySelectorAll("[data-fan-fmt]").forEach((b) => {
      b.classList.toggle("on", b.dataset.fanFmt === format);
    });
    render();
    restart();
  }

  document.querySelectorAll("[data-fan-fmt]").forEach((b) => {
    b.addEventListener("click", () => {
      const next = b.dataset.fanFmt;
      if (!boards[next]?.length || next === format) return;
      format = next;
      paint();
    });
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
