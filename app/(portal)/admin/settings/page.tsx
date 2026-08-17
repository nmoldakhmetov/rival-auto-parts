import SettingsForm from "@/components/admin/SettingsForm";
import WarehouseColors from "@/components/admin/WarehouseColors";
import KaspiPaySettings from "@/components/admin/KaspiPaySettings";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Настройки — Админ-панель" };

export default async function AdminSettingsPage() {
  const session = await getSession();
  // Раздел открыт только владельцу (middleware), но право на правку цветов
  // проверяет и API — держим условие одинаковым с обеих сторон.
  const canEdit = session?.role === "ADMIN" || session?.role === "RA";

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Настройки</h1>
      <p className="mb-5 text-xs text-muted">Тексты и параметры портала.</p>
      <SettingsForm />
      {/* Приём онлайн-оплаты: реквизиты Kaspi Pay правит только владелец. */}
      {session?.role === "ADMIN" && (
        <div className="mt-5 max-w-2xl">
          <KaspiPaySettings />
        </div>
      )}
      <div className="mt-5">
        <WarehouseColors canEdit={canEdit} />
      </div>
    </div>
  );
}
