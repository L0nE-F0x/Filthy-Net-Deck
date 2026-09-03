import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { bootThemeFromStorage } from "./services/theme";
import { bootLocaleFromStorage } from "./i18n";

// Apply saved appearance before first paint (avoids a dark→light flash).
bootThemeFromStorage();
bootLocaleFromStorage();

const hash = typeof window !== "undefined" ? window.location.hash : "";
const routed = (name: string) =>
  hash === `#/${name}` || hash.startsWith(`#/${name}?`);

/*
 * Route-level code splitting: each Tauri webview (main / overlay / toast /
 * presence / presence-menu) loads only its own JS. Eager imports used to pull
 * the full main app (all pages + store + meta services) into every secondary
 * window, so a 30-line toast paid for the whole companion.
 */
const App = lazy(() => import("./App"));
const OverlayApp = lazy(() =>
  import("./overlay/OverlayApp").then((m) => ({ default: m.OverlayApp })),
);
const ToastApp = lazy(() =>
  import("./toast/ToastApp").then((m) => ({ default: m.ToastApp })),
);
const PresenceApp = lazy(() =>
  import("./presence/PresenceApp").then((m) => ({ default: m.PresenceApp })),
);
const PresenceMenuApp = lazy(() =>
  import("./presence/PresenceMenuApp").then((m) => ({ default: m.PresenceMenuApp })),
);

function Root() {
  if (routed("overlay")) return <OverlayApp />;
  if (routed("toast")) return <ToastApp />;
  if (routed("presence-menu")) return <PresenceMenuApp />;
  if (routed("presence")) return <PresenceApp />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);
