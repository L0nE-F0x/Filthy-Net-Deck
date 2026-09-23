/**
 * After a drag: snap to a screen edge within `SNAP_PX`, then persist the
 * top-left through `saveCommand`. Shared by the presence badge and the match
 * alert — both are small always-on-top surfaces the user places once.
 *
 * Two paths, because a layer surface (Linux/Wayland) is placed by anchor
 * margins and cannot report where it is, while an ordinary window can.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../services/appUpdater";
import { layerMargins, layerReady, layerSize, moveLayerTo } from "./layerDrag";

const SNAP_PX = 24;

export async function snapAndPersist(saveCommand: string): Promise<void> {
  if (!isTauri()) return;
  await layerReady();
  try {
    const {
      getCurrentWindow,
      LogicalPosition,
      currentMonitor,
      primaryMonitor,
    } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const anchored = layerMargins();
    const tracked = layerSize();
    const logicalW = tracked
      ? tracked.width
      : (await win.outerSize()).width / factor;
    const logicalH = tracked
      ? tracked.height
      : (await win.outerSize()).height / factor;

    if (anchored) {
      const monitor = (await currentMonitor()) ?? (await primaryMonitor());
      if (monitor) {
        const maxLeft = Math.max(
          0,
          monitor.size.width / factor - logicalW,
        );
        const maxTop = Math.max(
          0,
          monitor.size.height / factor - logicalH,
        );
        let { left, top } = anchored;
        if (left <= SNAP_PX) left = 0;
        else if (Math.abs(left - maxLeft) <= SNAP_PX) left = maxLeft;
        if (top <= SNAP_PX) top = 0;
        else if (Math.abs(top - maxTop) <= SNAP_PX) top = maxTop;
        left = Math.min(Math.max(0, left), maxLeft);
        top = Math.min(Math.max(0, top), maxTop);
        await moveLayerTo(left, top);
        await invoke(saveCommand, {
          geometry: { x: left, y: top },
        });
      }
      return;
    }

    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return;

    const mx = monitor.position.x;
    const my = monitor.position.y;
    const mw = monitor.size.width;
    const mh = monitor.size.height;
    let x = pos.x;
    let y = pos.y;
    const right = mx + mw - size.width;
    const bottom = my + mh - size.height;
    const thr = SNAP_PX * factor;
    if (Math.abs(x - mx) <= thr) x = mx;
    else if (Math.abs(x - right) <= thr) x = right;
    if (Math.abs(y - my) <= thr) y = my;
    else if (Math.abs(y - bottom) <= thr) y = bottom;
    if (x !== pos.x || y !== pos.y) {
      await win.setPosition(new LogicalPosition(x / factor, y / factor));
    }
    await invoke(saveCommand, {
      geometry: { x: x / factor, y: y / factor },
    });
  } catch {
    /* ignore */
  }
}
