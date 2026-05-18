import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";
import "./styles.css";

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
