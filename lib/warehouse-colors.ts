// Цвета складских плашек.
//
// Плашки складов рябили одинаковым зелёным, и в списке из трёх складов
// клиент не различал их с одного взгляда. Цвет закреплён за складом и
// правится в админке.
//
// Цвет хранится в Warehouse.color как HEX (#rrggbb) — не как имя класса
// Tailwind. Так было сначала, и это не работало: Tailwind собирает CSS по
// строкам, найденным в app/ и components/, а классы палитры лежали здесь,
// в lib/ — половина цветов (розовый, графитовый, фиолетовый, бирюзовый)
// не попадала в сборку и рисовалась пустым кружком. HEX + inline-стиль
// снимает и это ограничение, и лимит на семь цветов: доступен любой цвет.
//
// Старые значения ("green", "blue", …) остаются валидными и раскрываются
// в HEX — на проде колонка уже могла быть заполнена ключами.

import type { CSSProperties } from "react";

export type WarehousePreset = { hex: string; label: string };

// Готовая палитра для быстрого выбора: полный круг оттенков плюс
// нейтральные. Любой другой цвет задаётся пипеткой или кодом.
export const WAREHOUSE_PRESETS: WarehousePreset[] = [
  { hex: "#dc2626", label: "Красный" },
  { hex: "#e11d48", label: "Розово-красный" },
  { hex: "#ec4899", label: "Розовый" },
  { hex: "#d946ef", label: "Фуксия" },
  { hex: "#7c3aed", label: "Фиолетовый" },
  { hex: "#4f46e5", label: "Индиго" },
  { hex: "#2563eb", label: "Синий" },
  { hex: "#0ea5e9", label: "Голубой" },
  { hex: "#06b6d4", label: "Бирюзовый" },
  { hex: "#0d9488", label: "Морской" },
  { hex: "#059669", label: "Изумрудный" },
  { hex: "#16a34a", label: "Зелёный" },
  { hex: "#65a30d", label: "Лаймовый" },
  { hex: "#ca8a04", label: "Жёлтый" },
  { hex: "#f59e0b", label: "Янтарный" },
  { hex: "#ea580c", label: "Оранжевый" },
  { hex: "#b45309", label: "Охра" },
  { hex: "#92400e", label: "Коричневый" },
  { hex: "#475569", label: "Графитовый" },
  { hex: "#6b7280", label: "Серый" },
  { hex: "#1f2937", label: "Угольный" },
];

export const DEFAULT_WAREHOUSE_COLOR = "#16a34a"; // зелёный — как было всегда

// Ключи первой версии этой настройки.
const LEGACY_KEYS: Record<string, string> = {
  green: "#16a34a",
  blue: "#2563eb",
  red: "#e11d48",
  slate: "#475569",
  amber: "#f59e0b",
  violet: "#7c3aed",
  teal: "#0d9488",
};

// Цвета по умолчанию для складов заказчика. Кнопка «сбросить» в админке
// возвращает склад именно к этому значению; склад, которого здесь нет
// (новый из 1С), остаётся зелёным — как выглядели все склады до настройки.
const DEFAULTS: Record<string, string> = {
  "БК склад": "#16a34a",
  "БК склад 2": "#2563eb",
  // Намеренно НЕ фирменный красный кнопок (#E53935): плашка в нём читается
  // как кнопка действия.
  "Car City склад": "#e11d48",
  "Петя склад": "#475569",
};

export function defaultColorFor(warehouseName: string): string {
  return DEFAULTS[warehouseName.trim()] ?? DEFAULT_WAREHOUSE_COLOR;
}

// Приводит любое хранимое/присланное значение к #rrggbb. Понимает #rgb,
// код без решётки и ключи первой версии. Мусор → null.
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (LEGACY_KEYS[raw]) return LEGACY_KEYS[raw];

  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return null;
}

// Итоговый цвет склада: свой, иначе цвет по умолчанию для этого имени.
export function resolveColor(
  value: string | null | undefined,
  warehouseName: string
): string {
  return normalizeColor(value) ?? defaultColorFor(warehouseName);
}

export function labelForColor(hex: string): string {
  const known = WAREHOUSE_PRESETS.find((p) => p.hex === hex.toLowerCase());
  return known ? known.label : hex.toUpperCase();
}

// ─── Производные оттенки плашки ──────────────────────────────────────────
//
// Из одного цвета собираем светлый фон, рамку и тёмный текст — те же
// пропорции, что у пар Tailwind 50/200/700, но для произвольного цвета.

function toHsl(hex: string): { h: number; s: number; l: number } {
  const v = normalizeColor(hex) ?? DEFAULT_WAREHOUSE_COLOR;
  const r = parseInt(v.slice(1, 3), 16) / 255;
  const g = parseInt(v.slice(3, 5), 16) / 255;
  const b = parseInt(v.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)} ${Math.round(Math.max(0, Math.min(100, s)))}% ${Math.round(
    Math.max(0, Math.min(100, l))
  )}%)`;

// Стиль плашки склада. Читается на белом фоне при любом выбранном цвете:
// светлота фона/рамки/текста задана жёстко, от цвета берутся тон и
// насыщенность.
export function badgeStyle(color: string): CSSProperties {
  const { h, s } = toHsl(color);
  const sat = Math.min(s, 85);
  return {
    backgroundColor: hsl(h, sat * 0.6, 96),
    borderColor: hsl(h, sat * 0.65, 85),
    color: hsl(h, Math.min(sat, 70), 30),
  };
}

// Кружок выбора цвета в админке — сам цвет, без осветления.
export function dotStyle(color: string): CSSProperties {
  return { backgroundColor: normalizeColor(color) ?? DEFAULT_WAREHOUSE_COLOR };
}
