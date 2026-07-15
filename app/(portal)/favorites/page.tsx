import FavoritesClient from "@/components/FavoritesClient";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Избранное — Rival Auto Parts" };

export default async function FavoritesPage() {
  const session = await getSession();
  return <FavoritesClient role={session?.role ?? "CLIENT"} />;
}
