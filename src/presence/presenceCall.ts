import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../services/appUpdater";

/** Fire-and-forget command; older builds simply don't have it. */
export async function presenceCall(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke(cmd, args);
  } catch {
    /* command unavailable in browser / older builds */
  }
}
