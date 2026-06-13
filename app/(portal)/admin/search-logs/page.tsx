import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSession } from "@/lib/auth";
import ClientSearchFilter from "@/components/admin/ClientSearchFilter";

export const dynamic = "force-dynamic";
export const metadata = { title: "История поиска — Админ-панель" };

const roleLabel: Record<string, string> = {
  ADMIN: "Админ",
  RA: "Rival Auto",
  MANAGER: "Менеджер",
  ACCOUNTANT: "Бухгалтер",
  CLIENT: "Клиент",
};

export default async function SearchLogsPage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const session = await getSession();
  const clientId = searchParams.client || "";
  const mgrId = session?.role === "MANAGER" ? session.sub : null;

  const [clients, logs] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", ...(mgrId ? { managerId: mgrId } : {}) },
      select: { id: true, fullName: true, login: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.searchLog.findMany({
      where: {
        ...(clientId ? { userId: clientId } : {}),
        ...(mgrId ? { user: { managerId: mgrId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { user: { select: { fullName: true, login: true, role: true } } },
    }),
  ]);

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">История поиска</h1>
      <p className="mb-4 text-xs text-muted">
        Теневое логирование запросов (последние {logs.length})
      </p>

      <div className="mb-3">
        <ClientSearchFilter clients={clients} value={clientId} />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-48">Дата</th>
              <th>Клиент</th>
              <th>Запрос</th>
              <th className="w-28 text-right">Найдено</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-16 text-center">
                  <Search size={28} className="mx-auto mb-2 text-gray-300" />
                  <div className="text-sm text-muted">
                    Запросов не зафиксировано
                  </div>
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="text-muted">{formatDateTime(l.createdAt)}</td>
                <td>
                  {l.user ? (
                    <>
                      <span className="font-medium text-ink">
                        {l.user.fullName}
                      </span>
                      <span className="ml-1 text-[11px] text-muted">
                        ({l.user.login} ·{" "}
                        {roleLabel[l.user.role] ?? l.user.role})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="font-medium text-ink">«{l.query}»</td>
                <td className="text-right">
                  <span
                    className={`badge border ${
                      l.resultsCount > 0
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-line bg-gray-50 text-muted"
                    }`}
                  >
                    {l.resultsCount}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
