import "server-only";

// Pushes a placed order to the 1С HTTP-service (template "/orders").
// Matches the 1С handler which reads client_name / client_phone /
// site_order_id / comment / products[{code, sku, qty, price}].

export type OneCOrderPayload = {
  site_order_id: string;
  client_name: string;
  client_phone: string;
  comment: string;
  products: {
    code: string | null;
    sku: string;
    qty: number;
    price: number;
  }[];
};

export type OneCOrderResult = {
  ok: boolean;
  orderNumber?: string;
  error?: string;
};

// 1С order comment.
//
//   самовывоз → "Самовывоз"
//   доставка  → "Доставка, Адрес: Казахстан, Алматы, Жибек жолы 11
//                (комментарий клиента)"
//
// ⚠ БЕЗ префикса «Заказ с сайта №…»: 1С подставляет его сама из
// site_order_id. Когда мы добавляли его тоже, в документе получалось
// «Заказ с сайта №0D390O. Заказ с сайта №0D390O. Доставка, …».
//
// The delivery address is composed from the client card: населённый пункт +
// адрес. Empty parts are dropped, so the string never carries dangling commas
// or doubled spaces; multi-line client comments are flattened to one line.
const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

export function buildOneCComment(opts: {
  pickup: boolean;
  city?: string | null;
  address?: string | null;
  comment?: string | null;
}): string {
  const parts: string[] = [];
  if (opts.pickup) {
    parts.push("Самовывоз");
  } else {
    // «Казахстан, Алматинская область, Алматы» + «Жибек жолы 11»
    const full = [clean(opts.city), clean(opts.address)]
      .filter(Boolean)
      .join(", ");
    parts.push(full ? `Доставка, Адрес: ${full}` : "Доставка");
  }
  const note = clean(opts.comment);
  if (note) parts.push(note);
  return parts.join(" ");
}

function ordersUrl(): string | null {
  if (process.env.ONEC_ORDERS_URL) return process.env.ONEC_ORDERS_URL;
  // Derive from the products feed: …/hs/v1/products → …/hs/v1/orders
  const base = process.env.ONEC_API_URL;
  if (!base) return null;
  try {
    const u = new URL(base);
    u.pathname = u.pathname.replace(/[^/]*$/, "orders");
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

export async function sendOrderToOneC(
  payload: OneCOrderPayload
): Promise<OneCOrderResult> {
  const url = ordersUrl();
  if (!url) return { ok: false, error: "ONEC_ORDERS_URL не настроен" };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const user = process.env.ONEC_API_USER;
  if (user) {
    const pass = process.env.ONEC_API_PASSWORD ?? "";
    headers.Authorization =
      "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `1С ответил ${res.status} ${res.statusText}` };
    }
    const data = (await res.json().catch(() => ({}))) as {
      order_number?: unknown;
    };
    return {
      ok: true,
      orderNumber:
        data?.order_number != null ? String(data.order_number) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
