// Curated catalog taxonomy over the FLAT category strings coming from 1С.
//
// 1С gives us ~51 unrelated names ("AUTO BOSS (дисковые)", "Фильтр воздушный",
// "Кузов BYD QIN PLUS", …). The customer wants them presented as a 3-level
// tree where the top level contains umbrella groups that DO NOT exist in 1С
// ("Тормозные колодки", "Фильтра", "Ремкомплект"), so the structure has to be
// declared here explicitly rather than derived from the strings.
//
// `category` on a node = the exact 1С value it filters by (a real leaf).
// A node with `children` is a virtual group: selecting it filters by every
// 1С category underneath it.
//
// Any 1С category missing from this map is NOT lost — the filters API appends
// it as a top-level leaf (see buildCategoryTree), so a new folder in 1С shows
// up in the catalog immediately, just outside the curated order.
//
// Plain module (no "server-only"): imported by the API routes and the client.

export type TaxNode = {
  label: string;
  category?: string;
  children?: TaxNode[];
};

// Order is intentional (as specified by the customer), not alphabetical.
export const CATEGORY_TAXONOMY: TaxNode[] = [
  {
    label: "Тормозные колодки",
    children: [
      {
        label: "AUTO BOSS",
        children: [
          { label: "AUTO BOSS (барабанные)", category: "AUTO BOSS (барабанные)" },
          { label: "AUTO BOSS (дисковые)", category: "AUTO BOSS (дисковые)" },
        ],
      },
      { label: "CHINA AUTO", category: "CHINA AUTO" },
      {
        label: "HARDRON",
        children: [
          { label: "HARDRON (барабанные)", category: "HARDRON (барабанные)" },
          { label: "HARDRON Ceramic", category: "HARDRON Ceramic" },
        ],
      },
      { label: "KRATEX", category: "KRATEX" },
      { label: "MultiBRAND", category: "MultiBRAND" },
      {
        label: "Ruvill",
        children: [
          { label: "Ruvill", category: "Ruvill" },
          { label: "Ruvill Барабанные", category: "Ruvill Барабанные" },
        ],
      },
      {
        label: "Truckman Orange",
        children: [
          { label: "Truckman Orange", category: "Truckman Orange" },
          {
            label: "Truckman Orange (барабанные)",
            category: "Truckman Orange (барабанные)",
          },
          { label: "Truckman черный", category: "Truckman черный" },
        ],
      },
      { label: "UIDNU Ceramic", category: "UIDNU Ceramic" },
    ],
  },

  { label: "Диски UIDNU", category: "Диски UIDNU" },

  {
    label: "Кузов",
    children: [
      { label: "Кузов BYD Destroyer 05", category: "Кузов BYD Destroyer 05" },
      { label: "Кузов BYD E2 2023", category: "Кузов BYD E2 2023" },
      { label: "Кузов BYD QIN PLUS", category: "Кузов BYD QIN PLUS" },
      { label: "Кузов BYD SEAGULL", category: "Кузов BYD SEAGULL" },
      {
        label: "Кузов BYD SONG PLUS EV 2023",
        category: "Кузов BYD SONG PLUS EV 2023",
      },
      { label: "Кузов Chevrolet Monza", category: "Кузов Chevrolet Monza" },
      {
        label: "Кузов Hyundai Custin 2023--",
        category: "Кузов Hyundai Custin 2023--",
      },
      { label: "Кузов Hyundai Elantra", category: "Кузов Hyundai Elantra" },
      { label: "Кузов HYUNDAI LAFESTA", category: "Кузов HYUNDAI LAFESTA" },
      { label: "Кузов HYUNDAI MUFASA 2023", category: "Кузов HYUNDAI MUFASA 2023" },
      {
        label: "Кузов Hyundai Tucson 2022-- (Китайская сборка)",
        category: "Кузов Hyundai Tucson 2022-- (Китайская сборка)",
      },
      {
        label: "Кузов KIA K5 2023 (Китайская сборка)",
        category: "Кузов KIA K5 2023 (Китайская сборка)",
      },
      {
        label: "Кузов KIA SELTOS 2024 (Китайской сборки)",
        category: "Кузов KIA SELTOS 2024 (Китайской сборки)",
      },
      { label: "Кузов VW ID6", category: "Кузов VW ID6" },
      {
        label: "Кузов VW Tiguan 2021 (китайская сборка)",
        category: "Кузов VW Tiguan 2021 (китайская сборка)",
      },
      { label: "ZEEKR X 2023--", category: "ZEEKR X 2023--" },
      {
        label: "Hyundai Sonata 2021-- (китайская сборка)",
        // NB: the 1С value has a double space before "(китайская" — keep it
        // byte-exact, it is the join key for the filter query.
        category: "Hyundai Sonata 2021--  (китайская сборка)",
      },
      {
        label: "KIA Sportage 2021-- (китайская сборка)",
        category: "KIA Sportage 2021-- (китайская сборка)",
      },
      { label: "LI L7", category: "LI L7" },
      { label: "Стекла", category: "Стекла" },
    ],
  },

  {
    label: "Фильтра",
    children: [
      { label: "Фильтр воздушный", category: "Фильтр воздушный" },
      { label: "Фильтр коробки передач", category: "Фильтр коробки передач" },
      { label: "Фильтр масляный", category: "Фильтр масляный" },
      { label: "Фильтр салонный", category: "Фильтр салонный" },
      { label: "Фильтр топливный", category: "Фильтр топливный" },
    ],
  },

  {
    label: "Обесшумки",
    children: [
      { label: "Обесшумки POWER STINGER", category: "Обесшумки POWER STINGER" },
      { label: "Обесшумки RUVILL", category: "Обесшумки RUVILL" },
    ],
  },

  {
    label: "Ремкомплект",
    children: [
      {
        label: "Ремком,барабан.торм, POWER STINGER",
        category: "Ремком,барабан.торм, POWER STINGER",
      },
      {
        label: "Ремком. торм. супп. Power Stinger",
        category: "Ремком. торм. супп. Power Stinger",
      },
      {
        label: "Ремком. торм. супп. Ruvill",
        category: "Ремком. торм. супп. Ruvill",
      },
    ],
  },

  {
    label: "BCG (НАПРАВЛЯЮЩИЙ СУППОРТ)",
    category: "BCG (НАПРАВЛЯЮЩИЙ СУППОРТ)",
  },
  { label: "Датчики износа колодок", category: "Датчики износа колодок" },
  {
    label: "Пыльник.напр.супп.POWER STINGER",
    category: "Пыльник.напр.супп.POWER STINGER",
  },
  { label: "Распродажа", category: "Распродажа" },
  { label: "СМАЗКА", category: "СМАЗКА" },
];

// Node identity used in the `categoryGroup` query param: the path of labels
// («Тормозные колодки/Ruvill»). Labels can repeat across levels (a "Ruvill"
// group holding a "Ruvill" leaf), so a plain label would be ambiguous.
export const PATH_SEP = "/";

export function nodePath(parentPath: string, node: TaxNode): string {
  return parentPath ? `${parentPath}${PATH_SEP}${node.label}` : node.label;
}

// All real 1С categories under a node (itself if it is a leaf).
export function collectCategories(node: TaxNode): string[] {
  if (node.category) return [node.category];
  const out: string[] = [];
  for (const c of node.children ?? []) out.push(...collectCategories(c));
  return out;
}

// Every 1С category the taxonomy knows about — used to detect strays.
export function taxonomyCategories(): Set<string> {
  const out = new Set<string>();
  for (const n of CATEGORY_TAXONOMY) {
    for (const c of collectCategories(n)) out.add(c);
  }
  return out;
}

// Resolves a `categoryGroup` path to the 1С categories it should filter by.
// Returns an empty array when the path is unknown (caller falls back).
export function categoriesUnderPath(path: string): string[] {
  const parts = path.split(PATH_SEP).filter(Boolean);
  if (parts.length === 0) return [];
  let level: TaxNode[] = CATEGORY_TAXONOMY;
  let node: TaxNode | undefined;
  for (const part of parts) {
    node = level.find((n) => n.label === part);
    if (!node) return [];
    level = node.children ?? [];
  }
  return node ? collectCategories(node) : [];
}
