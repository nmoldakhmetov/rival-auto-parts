import OrdersAdmin from "@/components/admin/OrdersAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Заказы — Админ-панель" };

export default function AdminOrdersPage() {
  return <OrdersAdmin />;
}
