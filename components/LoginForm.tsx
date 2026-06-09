"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        setLoading(false);
        return;
      }
      // Full reload so middleware/layout pick up the new session cookie.
      window.location.href = data.role === "ADMIN" ? "/admin" : next;
    } catch {
      setError("Сервер недоступен. Повторите попытку.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink">
          Логин
        </label>
        <input
          className="input"
          type="text"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="например, client"
          autoFocus
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink">
          Пароль
        </label>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent-dark">
          {error}
        </div>
      )}

      <button type="submit" className="btn-accent w-full" disabled={loading}>
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <LogIn size={16} />
        )}
        {loading ? "Вход…" : "Войти"}
      </button>

      <div className="rounded border border-line bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold text-ink/70">Демо-доступы:</span>{" "}
        admin / admin123 · manager / manager123 · client / client123
      </div>
    </form>
  );
}
