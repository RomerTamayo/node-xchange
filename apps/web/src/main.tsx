import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";
import { getLang } from "./lib/i18n.ts";

document.documentElement.lang = getLang();

// On phones the keyboard shrinks the *visible* area, and iOS also scrolls the
// page to keep the input in view, pushing the whole app off screen. The chat
// layout follows the visible area instead (see --app-h / --app-top).
const vv = window.visualViewport;
if (vv) {
  const sync = () => {
    const root = document.documentElement.style;
    root.setProperty("--app-h", `${vv.height}px`);
    root.setProperty("--app-top", `${vv.offsetTop}px`);
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
