"use client";

import { useRouter } from "next/navigation";

type ClientOpt = { id: string; fullName: string; login: string };

export default function ClientSearchFilter({
  clients,
  value,
}: {
  clients: ClientOpt[];
  value: string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) =>
        router.push(
          e.target.value
            ? `/admin/search-logs?client=${e.target.value}`
            : "/admin/search-logs"
        )
      }
      className="input w-72"
    >
      <option value="">Все пользователи</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.fullName} ({c.login})
        </option>
      ))}
    </select>
  );
}
