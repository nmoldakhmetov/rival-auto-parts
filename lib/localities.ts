// Reference tree for the «Населённый пункт» picker: страна → область →
// населённый пункт. Stored in the User.city column as one comma-joined string
// («Казахстан, Алматинская область, Алматы»).
//
// ⚠ This is a STARTER list, not an exhaustive registry. It covers Kazakhstan
// down to the regional centres and the larger towns, and the neighbouring
// countries at city level. The picker always accepts free text, so a manager
// can type any settlement that is missing here. If the customer has a
// canonical list (1С classifier, delivery-service directory), replace the
// contents of this file — nothing else has to change.
//
// Kazakhstan is listed per the 2022 administrative reform: 17 regions plus the
// three cities of republican significance.

export type GeoNode = { name: string; children?: GeoNode[] };

const KZ_REGIONS: GeoNode[] = [
  {
    name: "Абайская область",
    children: [
      { name: "Семей" },
      { name: "Аягоз" },
      { name: "Курчатов" },
      { name: "Шар" },
    ],
  },
  {
    name: "Акмолинская область",
    children: [
      { name: "Кокшетау" },
      { name: "Степногорск" },
      { name: "Атбасар" },
      { name: "Щучинск" },
      { name: "Акколь" },
      { name: "Есиль" },
      { name: "Ерейментау" },
      { name: "Макинск" },
      { name: "Косшы" },
    ],
  },
  {
    name: "Актюбинская область",
    children: [
      { name: "Актобе" },
      { name: "Кандыагаш" },
      { name: "Хромтау" },
      { name: "Алга" },
      { name: "Шалкар" },
      { name: "Эмба" },
      { name: "Темир" },
    ],
  },
  {
    name: "Алматинская область",
    children: [
      { name: "Конаев" },
      { name: "Каскелен" },
      { name: "Талгар" },
      { name: "Есик" },
      { name: "Узынагаш" },
      { name: "Шелек" },
      { name: "Отеген батыр" },
      { name: "Байсерке" },
    ],
  },
  {
    name: "Атырауская область",
    children: [
      { name: "Атырау" },
      { name: "Кульсары" },
      { name: "Макат" },
      { name: "Доссор" },
    ],
  },
  {
    name: "Восточно-Казахстанская область",
    children: [
      { name: "Усть-Каменогорск" },
      { name: "Риддер" },
      { name: "Алтай" },
      { name: "Серебрянск" },
      { name: "Шемонаиха" },
      { name: "Зайсан" },
    ],
  },
  {
    name: "Жамбылская область",
    children: [
      { name: "Тараз" },
      { name: "Шу" },
      { name: "Каратау" },
      { name: "Жанатас" },
      { name: "Мерке" },
      { name: "Кордай" },
    ],
  },
  {
    name: "Жетысуская область",
    children: [
      { name: "Талдыкорган" },
      { name: "Текели" },
      { name: "Ушарал" },
      { name: "Сарканд" },
      { name: "Жаркент" },
      { name: "Уштобе" },
    ],
  },
  {
    name: "Западно-Казахстанская область",
    children: [{ name: "Уральск" }, { name: "Аксай" }],
  },
  {
    name: "Карагандинская область",
    children: [
      { name: "Караганда" },
      { name: "Темиртау" },
      { name: "Балхаш" },
      { name: "Сарань" },
      { name: "Шахтинск" },
      { name: "Абай" },
      { name: "Приозерск" },
    ],
  },
  {
    name: "Костанайская область",
    children: [
      { name: "Костанай" },
      { name: "Рудный" },
      { name: "Лисаковск" },
      { name: "Житикара" },
      { name: "Аркалык" },
    ],
  },
  {
    name: "Кызылординская область",
    children: [
      { name: "Кызылорда" },
      { name: "Байконур" },
      { name: "Аральск" },
      { name: "Казалинск" },
      { name: "Жанакорган" },
      { name: "Шиели" },
    ],
  },
  {
    name: "Мангистауская область",
    children: [
      { name: "Актау" },
      { name: "Жанаозен" },
      { name: "Форт-Шевченко" },
      { name: "Бейнеу" },
    ],
  },
  {
    name: "Павлодарская область",
    children: [{ name: "Павлодар" }, { name: "Экибастуз" }, { name: "Аксу" }],
  },
  {
    name: "Северо-Казахстанская область",
    children: [
      { name: "Петропавловск" },
      { name: "Булаево" },
      { name: "Мамлютка" },
      { name: "Тайынша" },
      { name: "Сергеевка" },
    ],
  },
  {
    name: "Туркестанская область",
    children: [
      { name: "Туркестан" },
      { name: "Кентау" },
      { name: "Сарыагаш" },
      { name: "Арыс" },
      { name: "Жетысай" },
      { name: "Шардара" },
      { name: "Ленгер" },
    ],
  },
  {
    name: "Улытауская область",
    children: [
      { name: "Жезказган" },
      { name: "Сатпаев" },
      { name: "Каражал" },
      { name: "Улытау" },
    ],
  },
];

export const LOCALITIES: GeoNode[] = [
  {
    name: "Казахстан",
    children: [
      // Города республиканского значения идут первыми — ими пользуются чаще.
      { name: "Алматы" },
      { name: "Астана" },
      { name: "Шымкент" },
      ...KZ_REGIONS,
    ],
  },
  {
    name: "Беларусь",
    children: [
      { name: "Минск" },
      { name: "Гомель" },
      { name: "Могилёв" },
      { name: "Витебск" },
      { name: "Гродно" },
      { name: "Брест" },
    ],
  },
  {
    name: "Грузия",
    children: [
      { name: "Тбилиси" },
      { name: "Батуми" },
      { name: "Кутаиси" },
      { name: "Рустави" },
    ],
  },
  {
    name: "Кыргызстан",
    children: [
      { name: "Бишкек" },
      { name: "Ош" },
      { name: "Джалал-Абад" },
      { name: "Каракол" },
      { name: "Токмок" },
      { name: "Нарын" },
      { name: "Талас" },
      { name: "Баткен" },
    ],
  },
  {
    name: "Россия",
    children: [
      { name: "Москва" },
      { name: "Санкт-Петербург" },
      { name: "Новосибирск" },
      { name: "Екатеринбург" },
      { name: "Казань" },
      { name: "Челябинск" },
      { name: "Омск" },
      { name: "Самара" },
      { name: "Ростов-на-Дону" },
      { name: "Уфа" },
      { name: "Красноярск" },
      { name: "Воронеж" },
      { name: "Волгоград" },
      { name: "Тюмень" },
      { name: "Барнаул" },
      { name: "Оренбург" },
      { name: "Астрахань" },
      { name: "Саратов" },
    ],
  },
  {
    name: "Таджикистан",
    children: [
      { name: "Душанбе" },
      { name: "Худжанд" },
      { name: "Бохтар" },
      { name: "Куляб" },
    ],
  },
  {
    name: "Туркменистан",
    children: [
      { name: "Ашхабад" },
      { name: "Туркменабат" },
      { name: "Дашогуз" },
      { name: "Мары" },
      { name: "Балканабат" },
    ],
  },
  {
    name: "Узбекистан",
    children: [
      { name: "Ташкент" },
      { name: "Самарканд" },
      { name: "Бухара" },
      { name: "Наманган" },
      { name: "Андижан" },
      { name: "Фергана" },
      { name: "Нукус" },
      { name: "Карши" },
      { name: "Термез" },
    ],
  },
  {
    name: "Украина",
    children: [
      { name: "Киев" },
      { name: "Харьков" },
      { name: "Одесса" },
      { name: "Днепр" },
      { name: "Львов" },
      { name: "Запорожье" },
    ],
  },
];

// Labels for the dropdown header, by how many segments are already chosen.
export const LEVEL_LABELS = ["Страна", "Область / город", "Населённый пункт"];
