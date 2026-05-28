import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles/app.css";
import "./styles/webview-compat.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
