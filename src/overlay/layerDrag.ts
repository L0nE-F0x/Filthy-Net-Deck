/**
 * Dragging the HUD when it is a wlr-layer-shell surface (Linux/Wayland).
 *
 * Why this file exists: under Wayland the HUD is promoted to the layer shell's
 * `overlay` layer, because that is the only way it can sit above a fullscreen
 * Arena *and* still receive clicks (see `src-tauri/src/layer_shell.rs`). A layer
 * surface has no `xdg_toplevel`, and therefore no move request — so
 * `setPosition` does nothing, and Tauri's `data-tauri-drag-region`, which asks
 * the compositor for an `xdg_toplevel.move`, does nothing either. The HUD is
 * placed by anchor margins instead, and moving it means rewriting those.
 *
 * Everything here is inert on Windows, macOS, X11, and with
 * `FND_LAYER_SHELL=0`: `init` asks Rust whether this window actually became a
 * layer surface and installs nothing if it did not. No JSX changes, so those
 * platforms keep the native drag byte for byte.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../services/appUpdater";

export interface LayerMargins {
  left: number;
  top: number;
}

export interface LayerSize {
  width: number;
  height: number;
}

interface LayerGeometry extends LayerMargins, LayerSize {}

/**
 * Which window this module is driving. Overlay, presence and the match alert
 * are separate webviews, so each instance of this file sees only one of them —
 * pick the commands from the hash so no window reads the HUD's geometry.
 */
function defaultCommands(): { geometry: string; setMargins: string } {
  if (typeof location !== "undefined" && location.hash.includes("presence")) {
    return {
      geometry: "presence_layer_geometry",
      setMargins: "presence_set_margins",
    };
  }
  if (typeof location !== "undefined" && location.hash.includes("toast")) {
    return {
      geometry: "toast_layer_geometry",
      setMargins: "toast_set_margins",
    };
  }
  return {
    geometry: "overlay_layer_geometry",
    setMargins: "overlay_set_margins",
  };
}

const commands = defaultCommands();

/** What we last asked the compositor for, or null when not promoted. */
let geometry: LayerGeometry | null = null;
let installed = false;
let notifyDragEnd: (() => void) | null = null;

/**
 * Started at import, not at mount. The HUD's first sizing pass runs as soon as
 * the component mounts, and it must not read `layerSize()` before the answer is
 * in — it would see `null`, fall back to `outerSize`, and seed every later save
 * with the origin-sized rectangle. Anything that reads the geometry awaits this
 * first; after the initial resolve it is just a settled promise.
 */
const ready: Promise<void> = resolveGeometry();

async function resolveGeometry(): Promise<void> {
  if (!isTauri()) return;
  try {
    const answer = await invoke<LayerGeometry | null>(commands.geometry);
    // Copy rather than adopt: the drag mutates this in place as it goes, and
    // it must own the object rather than write through to a caller's.
    geometry = answer ? { ...answer } : null;
  } catch {
    // Older build, or a non-Linux target where the command is absent.
    geometry = null;
  }
}

/** Resolves once the HUD is known to be (or not to be) a layer surface. */
export function layerReady(): Promise<void> {
  return ready;
}

/** The HUD's current anchor margins, or null when it is an ordinary window. */
export function layerMargins(): LayerMargins | null {
  return geometry ? { left: geometry.left, top: geometry.top } : null;
}

/**
 * The HUD's real size, or null when it is an ordinary window.
 *
 * `Window.outerSize()` cannot be used for a layer surface: it answers with the
 * origin-sized rectangle GTK holds for a toplevel the surface does not have.
 * Persisting that reply is what walked the saved width down to `MIN_W` on every
 * save, so anything that records geometry must prefer this.
 */
export function layerSize(): LayerSize | null {
  return geometry ? { width: geometry.width, height: geometry.height } : null;
}

/** Record a size the app has just applied, so `layerSize` stays truthful. */
/** Keep the JS copy of the anchor in sync after a resize that also moved it. */
export function noteLayerPosition(left: number, top: number): void {
  if (!geometry) return;
  geometry.left = Math.max(0, left);
  geometry.top = Math.max(0, top);
}

export function noteLayerSize(width: number, height: number): void {
  if (!geometry) return;
  geometry.width = width;
  geometry.height = height;
}

/** True once the HUD is confirmed to be a layer surface. */
export function isLayerSurface(): boolean {
  return geometry !== null;
}

/**
 * Move the HUD. Optimistic: `margins` updates immediately so a drag in flight
 * keeps accumulating from the right place without waiting on the round trip.
 */
export async function moveLayerTo(left: number, top: number): Promise<void> {
  if (!geometry) return;
  const next = {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
  };
  if (next.left === geometry.left && next.top === geometry.top) return;
  geometry.left = next.left;
  geometry.top = next.top;
  try {
    await invoke(commands.setMargins, next);
  } catch {
    /* older build without the command — the surface just does not move */
  }
}

// --- Tauri's own drag-region predicate, mirrored ------------------------------
// Kept identical to `tauri/src/window/scripts/drag.js` on purpose: this module
// both *suppresses* the native drag and *replaces* it, and the two must agree
// on exactly which elements are grab handles, or a click on the bar would be
// swallowed by one and ignored by the other.

const DRAG_ATTR = "data-tauri-drag-region";
const CLICKABLE_TAGS = new Set([
  "A",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "LABEL",
  "SUMMARY",
]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "option",
]);

function isClickable(el: HTMLElement): boolean {
  return (
    CLICKABLE_TAGS.has(el.tagName) ||
    (el.hasAttribute("contenteditable") &&
      el.getAttribute("contenteditable") !== "false") ||
    (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") ||
    INTERACTIVE_ROLES.has(el.getAttribute("role") ?? "")
  );
}

function isDragRegion(path: EventTarget[]): boolean {
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    const attr = node.getAttribute(DRAG_ATTR);
    // A button with no drag attribute of its own blocks the drag, so the HUD's
    // controls stay clickable.
    if (isClickable(node) && attr === null) return false;
    if (attr === null) continue;
    if (attr === "false") return false;
    if (attr === "deep") return true;
    if (attr === "" || attr === "true") return node === path[0];
  }
  return false;
}

// --- The drag itself ---------------------------------------------------------

interface DragState {
  pointerId: number;
  /** Grab point in *client* coordinates — see the note in `onMove`. */
  grabX: number;
  grabY: number;
  frame: number | null;
  next: LayerMargins | null;
  moved: boolean;
}

let drag: DragState | null = null;

function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId || !geometry) return;

  // Client coordinates, not screen: under Wayland a client is never told where
  // its own surface sits, so `screenX` is measured from an origin the
  // compositor never reports and is not trustworthy here. Client coordinates
  // are always exact, and the arithmetic is self-correcting — once the surface
  // has moved, the grab point is back under the cursor and the next delta is
  // measured from there.
  const dx = e.clientX - drag.grabX;
  const dy = e.clientY - drag.grabY;
  if (dx === 0 && dy === 0) return;
  drag.moved = true;
  drag.next = { left: geometry.left + dx, top: geometry.top + dy };

  // One move per frame. Every one of these is an IPC round trip to the
  // compositor, and an unthrottled pointer stream sends far more than the
  // surface can actually be re-anchored.
  if (drag.frame === null) {
    drag.frame = window.requestAnimationFrame(() => {
      if (!drag) return;
      drag.frame = null;
      const target = drag.next;
      drag.next = null;
      if (target) void moveLayerTo(target.left, target.top);
    });
  }
}

function endDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const finished = drag;
  drag = null;
  if (finished.frame !== null) window.cancelAnimationFrame(finished.frame);
  if (finished.next) void moveLayerTo(finished.next.left, finished.next.top);
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  // Only a drag that actually moved is worth snapping and persisting; a plain
  // click on the bar must not rewrite the saved position.
  if (finished.moved) notifyDragEnd?.();
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || drag || !geometry) return;
  if (!isDragRegion(e.composedPath())) return;
  drag = {
    pointerId: e.pointerId,
    grabX: e.clientX,
    grabY: e.clientY,
    frame: null,
    next: null,
    moved: false,
  };
  // Listen on `window` rather than capturing the pointer on the element: the
  // implicit grab that comes with a held button already routes every move to
  // this surface, and the element under the cursor changes as the HUD moves.
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

/**
 * Stop Tauri's own drag handler from running. It is a bubble-phase `mousedown`
 * listener on `document`, so a capture-phase listener on `document` gets there
 * first. Without this it would ask for an `xdg_toplevel.move` that a layer
 * surface cannot serve.
 *
 * Narrow on purpose: propagation is only stopped for the elements Tauri itself
 * would have treated as a grab handle, so every button, link and input on the
 * HUD still receives its `mousedown` normally.
 */
function suppressNativeDrag(e: MouseEvent) {
  if (e.button !== 0 || !geometry) return;
  if (!isDragRegion(e.composedPath())) return;
  e.stopImmediatePropagation();
}

/**
 * Ask Rust whether the HUD is a layer surface and, if so, take over dragging.
 * Safe to call more than once; returns whether the margin drag is in effect.
 */
export async function initLayerDrag(opts: {
  onDragEnd: () => void;
  geometryCommand?: string;
  setMarginsCommand?: string;
}): Promise<boolean> {
  notifyDragEnd = opts.onDragEnd;
  const nextGeo = opts.geometryCommand ?? commands.geometry;
  const nextMarg = opts.setMarginsCommand ?? commands.setMargins;
  const rebound =
    nextGeo !== commands.geometry || nextMarg !== commands.setMargins;
  commands.geometry = nextGeo;
  commands.setMargins = nextMarg;
  if (rebound) {
    await resolveGeometry();
  } else {
    await ready;
  }
  if (installed) return geometry !== null;
  if (!geometry) return false;
  installed = true;
  document.addEventListener("mousedown", suppressNativeDrag, true);
  document.addEventListener("pointerdown", onPointerDown);
  return true;
}

// --- Resizing ----------------------------------------------------------------

export type ResizeEdge = "East" | "North" | "South" | "West" | "SouthEast";

interface ResizeState {
  edge: ResizeEdge;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startLeft: number;
  startTop: number;
  frame: number | null;
  next: (LayerSize & LayerMargins) | null;
  apply: (size: LayerSize) => void;
  onEnd: () => void;
}

let resize: ResizeState | null = null;

function onResizeMove(e: MouseEvent) {
  if (!resize || !geometry) return;
  const dx = e.clientX - resize.startX;
  const dy = e.clientY - resize.startY;

  // The HUD is anchored top-left, so growing from the North or West edge means
  // moving the anchor by as much as the size changes — otherwise the opposite
  // edge walks across the screen instead of staying put.
  let width = resize.startW;
  let height = resize.startH;
  let left = resize.startLeft;
  let top = resize.startTop;
  if (resize.edge === "East" || resize.edge === "SouthEast") width += dx;
  if (resize.edge === "West") {
    width -= dx;
    left += dx;
  }
  if (resize.edge === "South" || resize.edge === "SouthEast") height += dy;
  if (resize.edge === "North") {
    height -= dy;
    top += dy;
  }
  resize.next = { width, height, left, top };

  if (resize.frame === null) {
    resize.frame = window.requestAnimationFrame(() => {
      if (!resize) return;
      resize.frame = null;
      const target = resize.next;
      resize.next = null;
      if (!target) return;
      resize.apply({ width: target.width, height: target.height });
      if (target.left !== resize.startLeft || target.top !== resize.startTop) {
        void moveLayerTo(target.left, target.top);
      }
    });
  }
}

function endResize() {
  if (!resize) return;
  const finished = resize;
  resize = null;
  if (finished.frame !== null) window.cancelAnimationFrame(finished.frame);
  if (finished.next) {
    finished.apply({
      width: finished.next.width,
      height: finished.next.height,
    });
    void moveLayerTo(finished.next.left, finished.next.top);
  }
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", endResize);
  finished.onEnd();
}

/**
 * Resize a promoted HUD by dragging an edge.
 *
 * `startResizeDragging` is another `xdg_toplevel` request, so it is as inert on
 * a layer surface as the move was. The replacement drives the same
 * `overlay_set_extent` path the collapse/expand toggle uses, which does reach a
 * layer surface, and nudges the anchor for the two edges that need it.
 *
 * Returns false when the HUD is an ordinary window, so the caller falls back.
 */
export function startLayerResize(opts: {
  edge: ResizeEdge;
  event: { clientX: number; clientY: number };
  apply: (size: LayerSize) => void;
  onEnd: () => void;
}): boolean {
  if (!geometry || resize) return false;
  resize = {
    edge: opts.edge,
    startX: opts.event.clientX,
    startY: opts.event.clientY,
    startW: geometry.width,
    startH: geometry.height,
    startLeft: geometry.left,
    startTop: geometry.top,
    frame: null,
    next: null,
    apply: opts.apply,
    onEnd: opts.onEnd,
  };
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", endResize);
  return true;
}
