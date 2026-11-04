import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { store } from "./store";
import "./styles.css";

function Boot() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    store.init().then(() => {
      const state = store.getState();
      setError(state.bootError);
      setReady(state.ready);
    });
  }, []);
  if (error) return <p className="empty">数据库没有打开：{error}</p>;
  if (!ready) return <p className="empty">正在打开本地数据库…</p>;
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<Boot />);

if (import.meta.env.PROD) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
