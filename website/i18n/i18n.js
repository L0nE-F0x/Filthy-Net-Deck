/* Filthy Net Deck — marketing site i18n.
 *
 * English is NOT a catalog. The English copy lives inline in index.html, which
 * stays the hand-edited master; on boot we snapshot those strings and use them
 * as both the "en" catalog and the fallback for every missing key. So a
 * half-translated catalog degrades to English per string, and editing English
 * copy never means touching eight files.
 *
 * Locale set mirrors the app exactly — src/i18n/locales.ts (Arena client
 * languages, WotC FAQ 2026-07-08). Keep the two lists in sync.
 *
 * Markup contract:
 *   data-i18n="key"        → element.innerHTML  (catalog values may hold tags)
 *   data-i18n-label="key"  → aria-label
 *   data-i18n-title="key"  → title
 * Anything a script owns at runtime (#fan-name, #meta-list, deck and card
 * names) carries no key — see the note in index.html.
 */
(function () {
  "use strict";

  var LOCALE_IDS = ["en", "es", "fr", "de", "it", "pt-BR", "ja", "ko"];
  var LOCALE_NATIVE = {
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    it: "Italiano",
    "pt-BR": "Português (Brasil)",
    ja: "日本語",
    ko: "한국어",
  };
  /* Short code for the collapsed toggle. pt-BR would overflow the pill. */
  var LOCALE_SHORT = {
    en: "EN", es: "ES", fr: "FR", de: "DE",
    it: "IT", "pt-BR": "PT", ja: "JA", ko: "KO",
  };
  var STORAGE_KEY = "fnd.site.locale";

  /* Mirrors src/i18n/detect.ts::normalizeLocale — pt/pt-PT fold to pt-BR
     (Arena has no European Portuguese client), any es-* to one Spanish. */
  function normalizeLocale(raw) {
    if (!raw) return "en";
    var tag = String(raw).trim().replace(/_/g, "-");
    if (!tag) return "en";
    if (LOCALE_IDS.indexOf(tag) >= 0) return tag;
    var lower = tag.toLowerCase();
    if (lower.indexOf("pt") === 0) return "pt-BR";
    var prefixes = ["es", "fr", "de", "it", "ja", "ko", "en"];
    for (var i = 0; i < prefixes.length; i++) {
      if (lower.indexOf(prefixes[i]) === 0) return prefixes[i];
    }
    var primary = tag.split("-")[0];
    return LOCALE_IDS.indexOf(primary) >= 0 ? primary : "en";
  }

  function detectSystemLocale() {
    try {
      var list = navigator.languages && navigator.languages.length
        ? navigator.languages
        : navigator.language ? [navigator.language] : [];
      for (var i = 0; i < list.length; i++) {
        var hit = normalizeLocale(list[i]);
        if (hit !== "en" || /^en\b/i.test(list[i])) return hit;
      }
    } catch (e) { /* ignore */ }
    return "en";
  }

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return LOCALE_IDS.indexOf(v) >= 0 ? v : null;
    } catch (e) { return null; }
  }

  function writeStored(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* private mode */ }
  }

  /* ——— state ——— */
  var english = null;      // key → English innerHTML, snapshotted once
  var catalogs = { en: null };
  var current = "en";

  function snapshotEnglish() {
    if (english) return;
    english = {};
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      english[nodes[i].getAttribute("data-i18n")] = nodes[i].innerHTML;
    }
    var attrs = [["data-i18n-label", "aria-label"], ["data-i18n-title", "title"]];
    for (var a = 0; a < attrs.length; a++) {
      var found = document.querySelectorAll("[" + attrs[a][0] + "]");
      for (var j = 0; j < found.length; j++) {
        var key = found[j].getAttribute(attrs[a][0]);
        if (!(key in english)) english[key] = found[j].getAttribute(attrs[a][1]) || "";
      }
    }
    english["page.title"] = document.title;
    var desc = document.querySelector('meta[name="description"]');
    english["page.description"] = desc ? desc.getAttribute("content") : "";
    catalogs.en = english;
  }

  /* The version lives in index.html and nowhere else — the release checklist in
     AGENTS.md already edits it there. Catalogs write {version} instead, so a
     bump can never go stale in seven translated copies of the <title>. */
  function version() {
    var m = /v\d+\.\d+\.\d+/.exec((english && english["page.title"]) || "");
    return m ? m[0] : "";
  }

  function t(key, fallback) {
    var cat = catalogs[current];
    var val = cat && typeof cat[key] === "string" && cat[key] !== "" ? cat[key] : null;
    if (val === null && english && typeof english[key] === "string") val = english[key];
    if (val === null) return fallback != null ? fallback : key;
    return val.indexOf("{version}") >= 0 ? val.split("{version}").join(version()) : val;
  }

  function apply(id) {
    /* Set first: t() resolves against `current`, so the swap loop below would
       otherwise re-render every node in the locale we are leaving. */
    current = id;
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var next = t(el.getAttribute("data-i18n"));
      if (el.innerHTML !== next) el.innerHTML = next;
    }
    var pairs = [["data-i18n-label", "aria-label"], ["data-i18n-title", "title"]];
    for (var p = 0; p < pairs.length; p++) {
      var found = document.querySelectorAll("[" + pairs[p][0] + "]");
      for (var j = 0; j < found.length; j++) {
        found[j].setAttribute(pairs[p][1], t(found[j].getAttribute(pairs[p][0])));
      }
    }
    document.title = t("page.title");
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("page.description"));
    document.documentElement.setAttribute("lang", id === "pt-BR" ? "pt-BR" : id);
    syncToggle();
    /* hero-fan.js and friends re-label whatever they own at runtime. */
    document.dispatchEvent(new CustomEvent("fnd:locale", { detail: { locale: id } }));
  }

  function load(id) {
    if (id === "en" || catalogs[id]) return Promise.resolve(catalogs[id]);
    var pending = window.__fndI18nReq;
    var req = pending && pending.id === id
      ? pending.promise
      : fetch("i18n/" + id + ".json", { cache: "no-cache" }).then(function (r) {
          return r.ok ? r.json() : null;
        });
    return req.then(function (data) {
      catalogs[id] = data || {};
      return catalogs[id];
    }).catch(function () {
      catalogs[id] = {};   // fall back to English rather than half-render
      return catalogs[id];
    });
  }

  function setLocale(id, opts) {
    if (LOCALE_IDS.indexOf(id) < 0) id = "en";
    if (!opts || opts.persist !== false) writeStored(id);
    return load(id).then(function () { apply(id); });
  }

  /* ——— the toggle ——— */
  var toggleEl = null, menuEl = null, codeEl = null;

  function syncToggle() {
    if (!codeEl) return;
    codeEl.textContent = LOCALE_SHORT[current];
    if (toggleEl) {
      toggleEl.setAttribute(
        "aria-label",
        t("lang.switch", "Change language") + " — " + LOCALE_NATIVE[current],
      );
    }
    if (!menuEl) return;
    var opts = menuEl.querySelectorAll("[data-locale]");
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-locale") === current;
      opts[i].classList.toggle("on", on);
      opts[i].setAttribute("aria-checked", on ? "true" : "false");
    }
  }

  function closeMenu() {
    if (!toggleEl) return;
    toggleEl.setAttribute("aria-expanded", "false");
    if (menuEl) menuEl.hidden = true;
  }

  function buildToggle() {
    var host = document.getElementById("lang-switch");
    if (!host) return;
    toggleEl = host.querySelector(".lang-btn");
    menuEl = host.querySelector(".lang-menu");
    codeEl = host.querySelector(".lang-code");
    if (!toggleEl || !menuEl) return;

    menuEl.innerHTML = LOCALE_IDS.map(function (id) {
      return '<button type="button" role="menuitemradio" aria-checked="false" ' +
        'data-locale="' + id + '" lang="' + id + '">' +
        '<span class="lang-native">' + LOCALE_NATIVE[id] + "</span>" +
        '<span class="lang-tag">' + LOCALE_SHORT[id] + "</span>" +
        "</button>";
    }).join("");

    toggleEl.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = toggleEl.getAttribute("aria-expanded") === "true";
      toggleEl.setAttribute("aria-expanded", open ? "false" : "true");
      menuEl.hidden = open;
      if (!open) {
        var sel = menuEl.querySelector(".on") || menuEl.firstElementChild;
        if (sel) sel.focus();
      }
    });

    menuEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-locale]");
      if (!btn) return;
      closeMenu();
      toggleEl.focus();
      void setLocale(btn.getAttribute("data-locale"));
    });

    menuEl.addEventListener("keydown", function (e) {
      var items = [].slice.call(menuEl.querySelectorAll("[data-locale]"));
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var n = items.length;
        var next = ((i + (e.key === "ArrowDown" ? 1 : -1)) % n + n) % n;
        items[next].focus();
      } else if (e.key === "Escape") {
        closeMenu();
        toggleEl.focus();
      }
    });

    document.addEventListener("click", function (e) {
      if (!host.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    host.hidden = false;
  }

  function boot() {
    snapshotEnglish();
    buildToggle();
    var stored = readStored();
    var wanted = stored || detectSystemLocale();
    if (wanted === "en") { apply("en"); return; }
    /* Not persisted when it came from the browser: a visitor who never chose
       still gets their language, and still gets it if they change the OS. */
    void setLocale(wanted, { persist: stored != null });
  }

  window.fndI18n = {
    t: t,
    get locale() { return current; },
    setLocale: setLocale,
    locales: LOCALE_IDS.slice(),
    native: LOCALE_NATIVE,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
