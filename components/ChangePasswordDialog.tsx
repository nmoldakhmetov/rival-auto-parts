"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, X, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { MIN_PASSWORD } from "@/lib/password";

// Смена СВОЕГО пароля — доступна любой роли из блока пользователя в меню.
// Текущий пароль обязателен: сессия живёт долго, и без него чужой доступ к
// незалоченному телефону менял бы пароль навсегда.
export default function ChangePasswordDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Прокрутка фона под модалкой на телефоне уводила диалог за экран.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== repeat) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setError(`Новый пароль — минимум ${MIN_PASSWORD} символов`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось сменить пароль");
        return;
      }
      setDone(true);
    } catch {
      setError("Сервер недоступен. Повторите попытку.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "input w-full pr-10";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // На телефоне — лист снизу во всю ширину, на десктопе — обычная
        // модалка по центру. max-h + скролл: с поднятой клавиатурой места мало.
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <KeyRound size={16} />
            </div>
            <h2 className="text-base font-bold text-ink">Смена пароля</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="py-2 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-2 text-green-600" />
            <p className="text-sm font-semibold text-ink">Пароль изменён</p>
            <p className="mt-1 text-xs text-muted">
              В следующий раз входите с новым паролем.
            </p>
            <button onClick={onClose} className="btn-accent mt-4 w-full">
              Понятно
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Текущий пароль
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  className={field}
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Новый пароль
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  className={field}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  title={show ? "Скрыть пароли" : "Показать пароли"}
                  aria-label={show ? "Скрыть пароли" : "Показать пароли"}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:bg-gray-100 hover:text-ink"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Минимум {MIN_PASSWORD} символов.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Повторите новый пароль
              </label>
              <input
                type={show ? "text" : "password"}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
                className="input w-full"
              />
            </div>

            {error && (
              <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-dark">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !current || !next || !repeat}
              className="btn-accent w-full"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Сменить пароль
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
