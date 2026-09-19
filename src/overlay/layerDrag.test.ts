// @vitest-environment jsdom

/**
 * The HUD's drag and resize on a wlr-layer-shell surface.
 *
 * Worth testing rather than eyeballing: none of this can be exercised without a
 * Wayland compositor and a real mouse, and the arithmetic has two traps in it —
 * the drag has to read *client* coordinates (a layer surface is never told
 * where it is, so screen coordinates are measured from an origin the compositor
 * never reports), and resizing from the North or West edge has to move the
 * anchor by as much as the size changes or the opposite edge walks away.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../services/appUpdater", () => ({ isTauri: () => true }));

/** Fresh module per test — `layerDrag` holds the geometry in module state. */
async function load(geometry: unknown) {
  vi.resetModules();
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) => {
    // A fresh object each call, as real IPC would hand over — otherwise every
    // module instance in this file shares one and the drags accumulate.
    if (cmd === "overlay_layer_geometry") {
      return Promise.resolve(geometry ? { ...(geometry as object) } : null);
    }
    return Promise.resolve(true);
  });
  const mod = await import("./layerDrag");
  await mod.layerReady();
  return mod;
}

const PROMOTED = { left: 100, top: 80, width: 360, height: 34 };

/** One animation frame, plus the microtasks the invoke round trip queues. */
async function settle() {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await Promise.resolve();
  await Promise.resolve();
}

function grabHandle() {
  document.body.innerHTML = `<header data-tauri-drag-region id="bar"></header>`;
  return document.getElementById("bar")!;
}

function pointer(type: string, x: number, y: number) {
  // jsdom has no PointerEvent constructor; the fields the module reads are all
  // on MouseEvent, plus a pointerId it compares for identity.
  const e = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

function marginCalls(cmd = "overlay_set_margins") {
  return invoke.mock.calls.filter(([c]) => c === cmd);
}

describe("layerDrag — when the HUD is an ordinary window", () => {
  it("reports no geometry and installs nothing", async () => {
    const mod = await load(null);
    expect(mod.isLayerSurface()).toBe(false);
    expect(mod.layerMargins()).toBeNull();
    expect(mod.layerSize()).toBeNull();

    // The native drag must be left completely alone off Wayland.
    const bar = grabHandle();
    expect(await mod.initLayerDrag({ onDragEnd: () => undefined })).toBe(false);
    bar.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 40, 30));
    await settle();
    expect(marginCalls()).toHaveLength(0);
  });

  it("never invents a size for a window that can report its own", async () => {
    const mod = await load(null);
    mod.noteLayerSize(500, 400);
    expect(mod.layerSize()).toBeNull();
  });
});

describe("layerDrag — dragging a promoted HUD", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("moves the anchor by the pointer delta", async () => {
    const mod = await load(PROMOTED);
    const bar = grabHandle();
    await mod.initLayerDrag({ onDragEnd: () => undefined });

    bar.dispatchEvent(pointer("pointerdown", 50, 20));
    window.dispatchEvent(pointer("pointermove", 65, 45));
    await settle();

    const calls = marginCalls();
    expect(calls[calls.length - 1]?.[1]).toEqual({ left: 115, top: 105 });
    expect(mod.layerMargins()).toEqual({ left: 115, top: 105 });
  });

  it("clamps at the top-left corner instead of going negative", async () => {
    const mod = await load({ ...PROMOTED, left: 4, top: 4 });
    const bar = grabHandle();
    await mod.initLayerDrag({ onDragEnd: () => undefined });

    bar.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 10, 10));
    await settle();

    expect(mod.layerMargins()).toEqual({ left: 0, top: 0 });
  });

  it("does not treat a click on the bar as a drag", async () => {
    const mod = await load(PROMOTED);
    const bar = grabHandle();
    const onDragEnd = vi.fn();
    await mod.initLayerDrag({ onDragEnd });

    bar.dispatchEvent(pointer("pointerdown", 50, 20));
    window.dispatchEvent(pointer("pointerup", 50, 20));
    await settle();

    // A click that never moved must not rewrite the saved position.
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(marginCalls()).toHaveLength(0);
  });

  it("reports the end of a real drag so the caller can snap and persist", async () => {
    const mod = await load(PROMOTED);
    const bar = grabHandle();
    const onDragEnd = vi.fn();
    await mod.initLayerDrag({ onDragEnd });

    bar.dispatchEvent(pointer("pointerdown", 50, 20));
    window.dispatchEvent(pointer("pointermove", 90, 60));
    await settle();
    window.dispatchEvent(pointer("pointerup", 90, 60));
    await settle();

    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("ignores a press that did not start on a drag region", async () => {
    const mod = await load(PROMOTED);
    document.body.innerHTML = `<div id="plain"></div>`;
    await mod.initLayerDrag({ onDragEnd: () => undefined });

    document.getElementById("plain")!.dispatchEvent(pointer("pointerdown", 5, 5));
    window.dispatchEvent(pointer("pointermove", 80, 80));
    await settle();

    expect(marginCalls()).toHaveLength(0);
  });

  it("leaves buttons inside the bar clickable", async () => {
    const mod = await load(PROMOTED);
    document.body.innerHTML =
      `<header data-tauri-drag-region><button id="cog"></button></header>`;
    await mod.initLayerDrag({ onDragEnd: () => undefined });

    const clicked = vi.fn();
    const cog = document.getElementById("cog")!;
    cog.addEventListener("mousedown", clicked);
    cog.dispatchEvent(pointer("mousedown", 5, 5));
    cog.dispatchEvent(pointer("pointerdown", 5, 5));
    window.dispatchEvent(pointer("pointermove", 80, 80));
    await settle();

    // The suppression of Tauri's native drag must not swallow the cog's click,
    // and the button must not start a drag either.
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(marginCalls()).toHaveLength(0);
  });
});

describe("layerDrag — resizing a promoted HUD", () => {
  function mouse(type: string, x: number, y: number) {
    return new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  }

  it("grows to the right from the East edge without moving the anchor", async () => {
    const mod = await load(PROMOTED);
    const apply = vi.fn();
    expect(
      mod.startLayerResize({
        edge: "East",
        event: { clientX: 0, clientY: 0 },
        apply,
        onEnd: () => undefined,
      }),
    ).toBe(true);

    window.dispatchEvent(mouse("mousemove", 40, 0));
    await settle();

    expect(apply).toHaveBeenLastCalledWith({ width: 400, height: 34 });
    expect(mod.layerMargins()).toEqual({ left: 100, top: 80 });
  });

  it("moves the anchor when dragging the West edge, so the right edge stays put", async () => {
    const mod = await load(PROMOTED);
    const apply = vi.fn();
    mod.startLayerResize({
      edge: "West",
      event: { clientX: 0, clientY: 0 },
      apply,
      onEnd: () => undefined,
    });

    // Pulling the left edge 30px left is 30px wider and 30px further left.
    window.dispatchEvent(mouse("mousemove", -30, 0));
    await settle();

    expect(apply).toHaveBeenLastCalledWith({ width: 390, height: 34 });
    expect(mod.layerMargins()).toEqual({ left: 70, top: 80 });
  });

  it("moves the anchor when dragging the North edge", async () => {
    const mod = await load(PROMOTED);
    const apply = vi.fn();
    mod.startLayerResize({
      edge: "North",
      event: { clientX: 0, clientY: 0 },
      apply,
      onEnd: () => undefined,
    });

    window.dispatchEvent(mouse("mousemove", 0, -20));
    await settle();

    expect(apply).toHaveBeenLastCalledWith({ width: 360, height: 54 });
    expect(mod.layerMargins()).toEqual({ left: 100, top: 60 });
  });

  it("takes both axes from the SouthEast corner", async () => {
    const mod = await load(PROMOTED);
    const apply = vi.fn();
    mod.startLayerResize({
      edge: "SouthEast",
      event: { clientX: 10, clientY: 10 },
      apply,
      onEnd: () => undefined,
    });

    window.dispatchEvent(mouse("mousemove", 35, 60));
    await settle();

    expect(apply).toHaveBeenLastCalledWith({ width: 385, height: 84 });
    expect(mod.layerMargins()).toEqual({ left: 100, top: 80 });
  });

  it("reports the end so the caller persists once, not per frame", async () => {
    const mod = await load(PROMOTED);
    const onEnd = vi.fn();
    mod.startLayerResize({
      edge: "East",
      event: { clientX: 0, clientY: 0 },
      apply: () => undefined,
      onEnd,
    });

    window.dispatchEvent(mouse("mousemove", 20, 0));
    await settle();
    window.dispatchEvent(mouse("mousemove", 40, 0));
    await settle();
    window.dispatchEvent(mouse("mouseup", 40, 0));
    await settle();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("declines on an ordinary window so the caller falls back", async () => {
    const mod = await load(null);
    expect(
      mod.startLayerResize({
        edge: "East",
        event: { clientX: 0, clientY: 0 },
        apply: () => undefined,
        onEnd: () => undefined,
      }),
    ).toBe(false);
  });
});

describe("layerDrag — a click that lands on the drag-region parent", () => {
  it("starts a drag when the event target is the bar, not the child button", async () => {
    // The presence cog's padding is background:none; WebKitGTK then reports
    // the *bar* as the event target. If the bar is the drag region, Tauri
    // preventDefaults the mousedown and the cog never sees a click.
    const mod = await load(PROMOTED);
    document.body.innerHTML =
      `<header data-tauri-drag-region id="bar"><button id="cog">⚙</button></header>`;
    await mod.initLayerDrag({ onDragEnd: () => undefined });

    document.getElementById("bar")!.dispatchEvent(pointer("pointerdown", 5, 5));
    window.dispatchEvent(pointer("pointermove", 20, 10));
    await settle();

    expect(marginCalls().length).toBeGreaterThan(0);
  });
});

describe("layerDrag — a different window's commands", () => {
  it("drives presence commands when that window asks", async () => {
    vi.resetModules();
    invoke.mockReset();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "presence_layer_geometry") {
        return Promise.resolve({ left: 16, top: 800, width: 142, height: 32 });
      }
      if (cmd === "overlay_layer_geometry") {
        return Promise.resolve(null);
      }
      return Promise.resolve(true);
    });
    const mod = await import("./layerDrag");
    const bar = grabHandle();
    await mod.initLayerDrag({
      onDragEnd: () => undefined,
      geometryCommand: "presence_layer_geometry",
      setMarginsCommand: "presence_set_margins",
    });

    bar.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 40, 30));
    await settle();

    const calls = marginCalls("presence_set_margins");
    expect(calls[calls.length - 1]?.[1]).toEqual({ left: 46, top: 820 });
  });
});

describe("layerDrag — the size the app records", () => {
  it("keeps the size applied by the extent command", async () => {
    const mod = await load(PROMOTED);
    expect(mod.layerSize()).toEqual({ width: 360, height: 34 });
    mod.noteLayerSize(360, 252);
    expect(mod.layerSize()).toEqual({ width: 360, height: 252 });
    // The position must survive a resize untouched.
    expect(mod.layerMargins()).toEqual({ left: 100, top: 80 });
  });
});
