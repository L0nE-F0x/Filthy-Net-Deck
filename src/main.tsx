import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootThemeFromStorage } from "./services/theme";

// Apply saved appearance before first paint (avoids a dark→light flash).
bootThemeFromStorage();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
