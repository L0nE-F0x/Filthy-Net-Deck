/**
 * Which desktop OS is this build running on.
 *
 * Sniffed from the webview user agent rather than `@tauri-apps/plugin-os`,
 * because the same answer is needed in the browser build (where no Tauri
 * plugin exists) and in tests. WebKitGTK reports `X11; Linux x86_64`, WebView2
 * reports `Windows NT`, WKWebView reports `Macintosh`.
 *
 * Order matters: macOS is checked before Linux only for symmetry — no desktop
 * UA carries both — but Windows must come first, since `Windows NT` strings
 * historically also carried an `X11` compatibility token on some builds.
 */
export type OsName = "windows" | "macos" | "linux" | "unknown";

export function detectOs(
  ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): OsName {
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Linux ships as a distro package (Arch/AUR today), so the app never installs
 * its own updates there: no signed updater target is published, and handing
 * someone a package file to run by hand is the wrong move on a rolling distro.
 * Settings uses this to swap the download button for package-manager wording.
 */
export function updatesViaPackageManager(os: OsName = detectOs()): boolean {
  return os === "linux";
}
