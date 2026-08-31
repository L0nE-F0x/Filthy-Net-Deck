import { useCallback, useSyncExternalStore } from "react";
import {
  getLocale,
  readLocalePref,
  subscribeLocale,
  t,
  writeLocalePref,
  type MessageKey,
} from "./t";
import type { LocaleId, LocalePref } from "./locales";
import { pushOverlayPrefs } from "../services/overlay";

export function useLocale(): {
  locale: LocaleId;
  pref: LocalePref;
  t: typeof t;
  setPref: (pref: LocalePref) => void;
} {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  const setPref = useCallback((pref: LocalePref) => {
    writeLocalePref(pref);
    void pushOverlayPrefs();
  }, []);
  return { locale, pref: readLocalePref(), t, setPref };
}

export type { MessageKey };
