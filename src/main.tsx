import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { currentUser, logoutAccount, setLeaveHandler } from "./auth";
import { store } from "./store";
import type { AuthUser } from "./types";
import { AuthScreen } from "./ui/AuthScreen";
import "./styles.css";

function Boot() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function enter(next: AuthUser) {
    store.setUser(next);
    setUser(next);
    setError(null);
    setReady(false);
    await store.init();
    const state = store.getState();
    setError(state.bootError);
    setReady(state.ready);
  }

  useEffect(() => {
    setLeaveHandler(() => {
      store.reset();
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.removeProperty("--accent");
      setUser(null);
      setReady(false);
      setError(null);
    });
    currentUser()
      .then((existing) => {
        if (!existing) {
          setUser(null);
          return;
        }
        return enter(existing);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "无法确认登录状态");
        setUser(null);
      });
  }, []);

  if (user === undefined && !error) return <p className="empty">正在确认登录状态…</p>;
  if (!user) return <AuthScreen onSuccess={(next) => { void enter(next); }} />;
  if (error) {
    return (
      <p className="empty">
        数据库没有打开：{error}
        <button className="ghost" type="button" onClick={() => void logoutAccount()}>退出</button>
      </p>
    );
  }
  if (!ready) return <p className="empty">正在打开 D1 数据库…</p>;
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
