import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// «Возвраты» переехали вкладкой в «Мои заказы» — старые ссылки и закладки
// продолжают работать через этот редирект.
export default function ReturnsRedirect() {
  redirect("/orders?tab=returns");
}
