import Cart from "@/components/Cart";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Корзина — Rival Auto Parts" };

export default async function CartPage() {
  const discountDisplay = await getSetting("discount_display");
  return <Cart discountDisplay={discountDisplay} />;
}
