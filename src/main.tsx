import React from "react";
import ReactDOM from "react-dom/client";
import App from "./pages/App";
import "./index.css";
import { ensureStorageBuckets } from "./lib/supabase";

// Crear buckets de Storage si no existen
ensureStorageBuckets().catch(console.warn);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
