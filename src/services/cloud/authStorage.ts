/**
 * Session storage for the Supabase client.
 *
 * supabase-js defaults to `localStorage`, which in this app is shared by all
 * four webviews (main / overlay / toast / presence) because they share an
 * origin. Tokens have no business being reachable from the overlay, so the
 * desktop build keeps them in the Tauri store instead — a file in the app data
 * dir, outside the webview origin.
 *
 * Honest scope: this is compartmentalisation, not encryption. A desktop app's
 * tokens are readable by anything running as that user either way; the OS
 * keychain (tauri-plugin-stronghold) is the real answer if that ever matters.
 * This costs nothing and removes the sloppiest exposure.
 *
 * Falls back to in-memory outside Tauri so `npm run dev` and tests work.
 */

import { isTauri } from "../appUpdater";

const STORE_FILE = "auth.json";

type Store = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
};

let storePromise: Promise<Store | null> | null = null;

async function getStore(): Promise<Store | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = import("@tauri-apps/plugin-store")
      .then((m) => m.load(STORE_FILE, { autoSave: true }) as unknown as Promise<Store>)
      .catch(() => null);
  }
  return storePromise;
}

const memory = new Map<string, string>();

/**
 * The shape supabase-js expects. Async is fine — the client awaits these.
 */
export const tauriAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const store = await getStore();
    if (!store) return memory.get(key) ?? null;
    try {
      return (await store.get<string>(key)) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
    const store = await getStore();
    if (!store) return;
    try {
      await store.set(key, value);
      await store.save();
    } catch {
      /* keep the in-memory copy; the session just won't survive a restart */
    }
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    const store = await getStore();
    if (!store) return;
    try {
      await store.delete(key);
      await store.save();
    } catch {
      /* ignore */
    }
  },
};
