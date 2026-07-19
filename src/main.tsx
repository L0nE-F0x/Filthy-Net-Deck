import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import "./index.css";
import { bootThemeFromStorage } from "./services/theme";

// Apply saved appearance before first paint (avoids a dark→light flash).
bootThemeFromStorage();

const isOverlay =
  typeof window !== "undefined" &&
  (window.location.hash === "#/overlay" ||
    window.location.hash.startsWith("#/overlay?"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <OverlayApp /> : <App />}</React.StrictMode>,
);
