import { beforeEach, describe, expect, it } from "vitest";
import {
  readRetentionState,
  recordAppOpen,
  retentionSnapshot,
} from "./localRetention";

function memStorage() {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    configurable: true,
  });
}

describe("localRetention", () => {
  beforeEach(() => memStorage());

  it("records distinct open days once each", () => {
    const t0 = Date.parse("2026-07-10T10:00:00");
    recordAppOpen(t0);
    recordAppOpen(t0 + 3600_000); // same day
    let s = readRetentionState();
    expect(s.openDays).toHaveLength(1);
    recordAppOpen(Date.parse("2026-07-11T09:00:00"));
    s = readRetentionState();
    expect(s.openDays).toHaveLength(2);
    expect(s.firstOpenMs).toBe(t0);
  });

  it("flags day2 when a later open day exists", () => {
    const t0 = Date.parse("2026-07-10T10:00:00");
    recordAppOpen(t0);
    let snap = retentionSnapshot(undefined, t0);
    expect(snap.day2).toBe(false);
    recordAppOpen(Date.parse("2026-07-12T10:00:00"));
    snap = retentionSnapshot(undefined, Date.parse("2026-07-12T10:00:00"));
    expect(snap.openDayCount).toBe(2);
    expect(snap.day2).toBe(true);
  });
});
