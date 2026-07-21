import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import { ToastApp } from "./toast/ToastApp";
import "./index.css";
import { bootThemeFromStorage } from "./services/theme";

// Apply saved appearance before first paint (avoids a dark→light flash).
bootThemeFromStorage();

const hash = typeof window !== "undefined" ? window.location.hash : "";
const routed = (name: string) =>
  hash === `#/${name}` || hash.startsWith(`#/${name}?`);

function Root() {
  if (routed("overlay")) return <OverlayApp />;
  if (routed("toast")) return <ToastApp />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
