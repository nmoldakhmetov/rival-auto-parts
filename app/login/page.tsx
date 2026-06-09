import { Suspense } from "react";
import Image from "next/image";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Вход — Rival Auto Parts" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <Image
              src="/logo-wide.jpg"
              alt="Rival Auto"
              width={260}
              height={92}
              priority
              className="h-auto w-[230px] mix-blend-screen"
            />
          </div>
          <p className="text-sm text-white/50">
            Закрытый B2B-портал оптовых поставок
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-xl">
          <h1 className="mb-1 text-lg font-bold text-ink">Вход в систему</h1>
          <p className="mb-5 text-xs text-muted">
            Доступ только для зарегистрированных партнёров.
          </p>
          <Suspense
            fallback={<div className="text-sm text-muted">Загрузка…</div>}
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-white/40">
          Нет доступа? Обратитесь к вашему менеджеру —
          <br />
          самостоятельная регистрация закрыта.
        </p>
      </div>
    </main>
  );
}
