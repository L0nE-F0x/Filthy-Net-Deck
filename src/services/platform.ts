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
 * First guess, before Rust has said where this copy lives: on Linux, assume a
 * package manager owns it. Settings replaces the guess with `update_route` —
 * a copy from `install.sh` sits in a folder the user owns and updates itself
 * in-app; one from the pacman recipe sits in `/usr/bin` and cannot.
 */
export function updatesViaPackageManager(os: OsName = detectOs()): boolean {
  return os === "linux";
}

/**
 * Overlay click-through needs the OS to punch mouse events through a
 * transparent always-on-top window. tao/GTK cannot do that on Linux (and
 * asking while the widget is hidden aborts the process). Hide the control
 * there rather than ship a toggle that cannot work.
 */
export function overlayClickThroughAvailable(os: OsName = detectOs()): boolean {
  return os === "windows" || os === "macos";
}
