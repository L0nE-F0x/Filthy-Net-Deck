/**
 * Give jsdom tests back their `localStorage`.
 *
 * Node 26 ships an experimental Web Storage API, so `localStorage` is now a
 * property of Node's own `globalThis` — an accessor that warns and returns
 * undefined unless the process was started with `--localstorage-file`.
 *
 * Vitest's jsdom environment copies window properties onto that same
 * `globalThis`, but it skips any name already present there unless the name is
 * in its own hardcoded KEYS list — and `localStorage` is not in it, because
 * until Node 26 it never needed to be. So Node's dud accessor wins and every
 * `localStorage.getItem` in a jsdom test sees `undefined`.
 *
 * The real jsdom window is still reachable: the environment sets
 * `window.jsdom = dom` before populating globals. Re-point the two Storage
 * globals at it. No-ops outside jsdom, so the node-environment files that make
 * up most of the suite are untouched.
 */
interface JsdomHandle {
  window: { localStorage?: Storage; sessionStorage?: Storage };
}

const handle = (globalThis as { jsdom?: JsdomHandle }).jsdom;

if (handle?.window) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    const real = handle.window[key];
    if (!real) continue;
    Object.defineProperty(globalThis, key, {
      value: real,
      configurable: true,
      writable: true,
    });
  }
}
