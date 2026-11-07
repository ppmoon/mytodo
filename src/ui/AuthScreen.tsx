import { useState, type FormEvent } from "react";
import { loginAccount } from "../auth";
import type { AuthUser } from "../types";

export function AuthScreen({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      onSuccess(await loginAccount({ email, password }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "没有完成");
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="kicker">mytodo</p>
        <h1>登录</h1>
        <p className="meta">请使用已有账号登录。不开放注册。</p>
        <label className="field">邮箱
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">密码
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="primary" type="submit" disabled={pending}>{pending ? "请稍等…" : "登录"}</button>
      </form>
    </main>
  );
}
