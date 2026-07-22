import { describe, expect, it } from "vitest";
import { resolveUpdateOffer, type AppUpdateInfo } from "./appUpdater";

const signedOffer: AppUpdateInfo = {
  version: "9.9.9",
  canAutoInstall: true,
  installMode: "signed",
};

const fromVersionJson = {
  version: "9.9.9",
  downloadUrl: "https://filthy-net-deck.com/downloads/Filthy-Net-Deck-Setup-9.9.9.exe",
  notes: "notes",
};

describe("resolveUpdateOffer", () => {
  it("passes a signed offer through as auto-installable", () => {
    const offer = resolveUpdateOffer({ ok: true, update: signedOffer }, null);
    expect(offer).toEqual(signedOffer);
  });

  it("reports no update when the signed check says we're current", () => {
    expect(resolveUpdateOffer({ ok: true, update: null }, null)).toBeNull();
  });

  it("ignores version.json entirely once the signed check has answered", () => {
    // Otherwise a host that serves a tempting version.json could talk the app
    // out of the answer the signed updater already gave it.
    expect(resolveUpdateOffer({ ok: true, update: null }, fromVersionJson)).toBeNull();
  });

  it("never marks a version.json offer auto-installable", () => {
    // The security boundary: an unsigned source can inform, never authorise.
    // This is what stopped a compromised host from getting an unverified
    // installer downloaded and executed with /S.
    const offer = resolveUpdateOffer({ ok: false }, fromVersionJson);
    expect(offer).not.toBeNull();
    expect(offer!.canAutoInstall).toBe(false);
    expect(offer!.installMode).toBe("browser");
    expect(offer!.version).toBe("9.9.9");
  });

  it("offers nothing when the signed check failed and version.json has none", () => {
    expect(resolveUpdateOffer({ ok: false }, null)).toBeNull();
  });

  it("keeps the download URL so the browser fallback can open it", () => {
    const offer = resolveUpdateOffer({ ok: false }, fromVersionJson);
    expect(offer!.downloadUrl).toBe(fromVersionJson.downloadUrl);
  });

  it("has no install mode that installs without a signature", () => {
    // Guards the type itself: "silent" used to be a third mode that ran an
    // unverified .exe. Both remaining modes are safe — "signed" is minisign
    // verified, "browser" hands off to the OS.
    const modes = [
      resolveUpdateOffer({ ok: true, update: signedOffer }, null)?.installMode,
      resolveUpdateOffer({ ok: false }, fromVersionJson)?.installMode,
    ];
    expect(modes).toEqual(["signed", "browser"]);
  });
});
