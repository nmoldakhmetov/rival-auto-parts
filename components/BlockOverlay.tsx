"use client";

import { Lock, Phone, Mail, MessageCircle, LogOut } from "lucide-react";

// Экран блокировки. Раньше это была модалка ПОВЕРХ портала, и клиент
// продолжал ходить по разделам: закрыть её было нельзя, но переход по ссылке
// перерисовывал страницу без неё. Теперь портальный layout вместо всего
// приложения (меню, шапка, содержимое) рендерит только этот экран — ходить
// просто некуда, доступна лишь кнопка «Выйти».
export default function BlockOverlay({
  message,
  manager,
}: {
  message: string;
  manager: { fullName: string; phone: string | null; email: string | null } | null;
}) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  const wa = manager?.phone
    ? manager.phone.replace(/\D/g, "").replace(/^8/, "7")
    : null;

  return (
    // h-[100dvh]: на iOS Safari h-screen прячет низ карточки под панель
    // браузера — кнопка «Выйти» оказывалась недостижимой.
    <div className="flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-ink/95 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-7">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Lock size={26} />
        </div>
        <h2 className="mb-2 text-lg font-bold text-ink">Аккаунт заблокирован</h2>
        <p className="mb-5 whitespace-pre-line text-sm text-muted">{message}</p>

        {manager && (
          <div className="mb-5 rounded-lg border border-line bg-gray-50 p-4 text-left">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Ваш менеджер
            </div>
            <div className="font-semibold text-ink">{manager.fullName}</div>
            {manager.phone && (
              <a
                href={`tel:${manager.phone.replace(/\s/g, "")}`}
                className="mt-1 flex items-center gap-2 text-sm text-ink hover:text-accent"
              >
                <Phone size={14} className="text-accent" /> {manager.phone}
              </a>
            )}
            {manager.email && (
              <a
                href={`mailto:${manager.email}`}
                className="mt-1 flex items-center gap-2 text-sm text-muted hover:text-accent"
              >
                <Mail size={13} /> {manager.email}
              </a>
            )}
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircle size={16} /> Написать в WhatsApp
              </a>
            )}
          </div>
        )}

        <button onClick={logout} className="btn-ghost w-full">
          <LogOut size={15} /> Выйти
        </button>
      </div>
    </div>
  );
}
