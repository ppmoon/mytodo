import { useState, type FormEvent } from "react";
import { loginAccount, registerAccount } from "../auth";
import type { AuthUser } from "../types";

export function AuthScreen({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setPending(true);
    try {
      const user = mode === "login"
        ? await loginAccount({ email, password })
        : await registerAccount({ email, name, password });
      onSuccess(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "没有完成");
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="kicker">mytodo</p>
        <h1>登录后只看自己的待办</h1>
        <div className="auth-switch" role="tablist">
          <button type="button" className={mode === "login" ? "chip on" : "chip"} onClick={() => { setMode("login"); setError(""); }}>登录</button>
          <button type="button" className={mode === "register" ? "chip on" : "chip"} onClick={() => { setMode("register"); setError(""); }}>注册</button>
        </div>
        <label className="field">邮箱
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {mode === "register" && (
          <label className="field">名字
            <input autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        )}
        <label className="field">密码
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {mode === "register" && (
          <label className="field">再输入一次密码
            <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
          </label>
        )}
        {error && <p className="auth-error">{error}</p>}
        <button className="primary" type="submit" disabled={pending}>{pending ? "请稍等…" : mode === "login" ? "登录" : "注册并进入"}</button>
      </form>
    </main>
  );
}
