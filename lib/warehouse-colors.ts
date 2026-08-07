// Цвета складских плашек.
//
// Плашки складов рябили одинаковым зелёным, и в списке из трёх складов
// клиент не различал их с одного взгляда. Цвет закреплён за складом и
// правится в админке; здесь — палитра и значения по умолчанию.
//
// Ключ цвета хранится в Warehouse.color; неизвестный или пустой ключ
// откатывается к «green», чтобы новый склад из 1С сразу выглядел как
// раньше и ничего не ломал.

export type WarehouseColorKey =
  | "green"
  | "blue"
  | "red"
  | "slate"
  | "amber"
  | "violet"
  | "teal";

export type WarehouseColor = {
  key: WarehouseColorKey;
  label: string;
  // Классы плашки (обводка/фон/текст) и точка для выбора цвета в админке.
  badge: string;
  dot: string;
};

export const WAREHOUSE_COLORS: WarehouseColor[] = [
  {
    key: "green",
    label: "Зелёный",
    badge: "border-green-200 bg-green-50 text-green-700",
    dot: "bg-green-500",
  },
  {
    key: "blue",
    label: "Синий",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  {
    // Тёплый кирпичный, НЕ фирменный красный кнопок (#E53935): иначе плашка
    // склада читалась бы как кнопка действия.
    key: "red",
    label: "Красный",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  {
    key: "slate",
    label: "Графитовый",
    badge: "border-slate-300 bg-slate-100 text-slate-700",
    dot: "bg-slate-600",
  },
  {
    key: "amber",
    label: "Янтарный",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  {
    key: "violet",
    label: "Фиолетовый",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  {
    key: "teal",
    label: "Бирюзовый",
    badge: "border-teal-200 bg-teal-50 text-teal-700",
    dot: "bg-teal-500",
  },
];

export const DEFAULT_WAREHOUSE_COLOR: WarehouseColorKey = "green";

// Цвета по умолчанию для складов заказчика. Кнопка «сбросить» в админке
// возвращает склад именно к этому значению.
const DEFAULTS: Record<string, WarehouseColorKey> = {
  "БК склад": "green", // как было до появления цветов
  "БК склад 2": "blue",
  "Car City склад": "red",
  "Петя склад": "slate",
};

export function defaultColorFor(warehouseName: string): WarehouseColorKey {
  return DEFAULTS[warehouseName.trim()] ?? DEFAULT_WAREHOUSE_COLOR;
}

export function colorByKey(key?: string | null): WarehouseColor {
  return (
    WAREHOUSE_COLORS.find((c) => c.key === key) ??
    (WAREHOUSE_COLORS.find(
      (c) => c.key === DEFAULT_WAREHOUSE_COLOR
    ) as WarehouseColor)
  );
}

export function isWarehouseColorKey(v: unknown): v is WarehouseColorKey {
  return (
    typeof v === "string" && WAREHOUSE_COLORS.some((c) => c.key === v)
  );
}
