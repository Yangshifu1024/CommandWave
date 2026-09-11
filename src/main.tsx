import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/global.css";
import App from "./App";

// Dev-only debug handle (browser console / E2E probes). Stripped in builds.
if (import.meta.env.DEV) {
  import("./terminal/manager").then((m) => {
    (window as unknown as Record<string, unknown>).__cw = { terminalManager: m.terminalManager };
  });
}

// No StrictMode: effect double-invocation would spawn duplicate PTY sessions.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
