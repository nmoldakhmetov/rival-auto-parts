import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Настройки — Админ-панель" };

export default function AdminSettingsPage() {
  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Настройки</h1>
      <p className="mb-5 text-xs text-muted">Тексты и параметры портала.</p>
      <SettingsForm />
    </div>
  );
}
