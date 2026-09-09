import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/global.css";
import App from "./App";

// No StrictMode: effect double-invocation would spawn duplicate PTY sessions.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
