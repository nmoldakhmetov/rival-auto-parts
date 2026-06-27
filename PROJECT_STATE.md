# PROJECT_STATE.md — Rival Auto Parts (B2B портал)

> Снимок состояния проекта для передачи контекста в новый чат.
> Дата: **2026-06-21**. Расположение: `C:\rival-auto-parts`.
> Тип: закрытый B2B-портал оптовой торговли автозапчастями.

---

## 0. Краткое резюме

Закрытый оптовый B2B-портал автозапчастей (старт разработки 2026-06-02). Клиенты
входят по логину/паролю, видят каталог с персональными ценами/скидками и
наличием только по разрешённым складам, оформляют заказы (которые выгружаются в
1С), оформляют возвраты, получают рассылки. Админка с ролевой моделью доступа
(RBAC) управляет клиентами, заказами, скидками, рассылками, аналогами,
статистикой и настройками. Каталог наполняется синхронизацией с 1С.

**Тестовый деплой:** https://rival-auto-parts.vercel.app (БД — Neon serverless Postgres).
**Исходники (private):** https://github.com/nmoldakhmetov/rival-auto-parts (только код; `db-seed.sql` НИКОГДА не коммитится).

Демо-логины: `admin/admin123`, `ra/ra123`, `manager/manager123`,
`accountant/accountant123`, `client/client123`.

---

## 1. Стек технологий

| Слой | Технология |
|---|---|
| Фреймворк | **Next.js 14.2.35** (App Router, TypeScript, `experimental.instrumentationHook`) |
| Язык | **TypeScript 5** (`tsconfig` target `ES2017`, `incremental: true`) |
| UI | **React 18**, **Tailwind CSS 3.4**, **lucide-react** (иконки) |
| State (клиент) | **Zustand 5** (`store/cart.ts`, `store/search.ts`, `store/toast.ts`) |
| БД | **PostgreSQL 15** (локально), **Neon serverless Postgres** (прод) |
| ORM | **Prisma 6.19** (`@prisma/client`) — намеренно НЕ v7 (см. ниже) |
| Auth | Кастомный JWT в httpOnly-cookie `rival_session` через **jose** (Edge-safe) + **bcryptjs**. NextAuth НЕ используется |
| Импорт Excel | **xlsx** (SheetJS) — импорт аналогов |
| Планировщик | **node-cron 4** — авто-синхронизация и обслуживание (in-process) |
| HTTP | Нативный `fetch` (axios установлен «на всякий», но в коде не используется) |
| Деплой | Vercel (прод-рантайм на pooled-URL Neon), `postinstall: prisma generate` |

**Окружение разработки (Windows 11):**
- Node.js (на машине стоит 24 LTS), PostgreSQL 15 (служба `postgresql-x64-15`).
- Локальная БД `rival_auto_parts` @ localhost:5432, суперюзер `postgres`/`postgres`.
- `psql`: `C:\Program Files\PostgreSQL\15\bin\psql.exe` (не в PATH).
- ⚠️ Новые сессии PowerShell не видят node/npm в PATH — обновить:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
  (в bash-инструменте: `export PATH="$PATH:/c/Program Files/nodejs"`).

**Ключевые решения:**
- **Prisma v7 → v6 (даунгрейд).** `prisma init` ставит v7, чей генератор
  `prisma-client` пишет в `app/` (конфликт с App Router) и отключает автозагрузку
  `.env`. Удалён сгенерированный `prisma.config.ts`. ⚠️ Сейчас при командах
  Prisma есть warning «package.json#prisma is deprecated, removed in Prisma 7» —
  не критично, но при апгрейде до v7 переезд на `prisma.config.ts` потребуется.
- `tsconfig.json`: добавлен `"target": "ES2017"` (шаблон Next 14 его опускал →
  TS2802 на итерации Set/Map). При залипших диагностиках чистить `*.tsbuildinfo`.

**Скрипты:** `npm run dev` (:3000) · `npm run build` · `npm start` ·
`npm run db:seed` (`node prisma/seed.mjs`) · `npm run db:studio`.

---

## 2. Архитектура базы данных

Схема: `prisma/schema.prisma`. Клиент Prisma — `lib/prisma.ts`.

### Enums
- **`Role`**: `ADMIN | RA | MANAGER | ACCOUNTANT | CLIENT`
  *(дублируется в `lib/jwt.ts`)*.
- **`OrderStatus`**: `NEW | SENT | PROCESSING | OUT_OF_STOCK | ISSUED | COMPLETED | CANCELLED`.
- **`ReturnStatus`**: `NEW | PROCESSING | ACCEPTED | REJECTED`.
- **`ProductBadge`**: `NEW | HIT` (Новинка / Хит продаж).
- **`DiscountTarget`**: `ALL | PRODUCT | CATEGORY | BRAND`.

### Основные модели

**`User`** — администраторы, менеджеры, бухгалтеры, клиенты.
- `role`, `login` (уникальный), `passwordHash`, `fullName`, `email?`, `phone?`
  (для менеджера = номер WhatsApp), `address?`, `city?`.
- `balance` `Decimal(12,2)` (долг = отрицательный), `discountPercent` (персональная %),
  `comment?`, `isActive` (флаг блокировки), `debtSince?` (когда баланс ушёл в минус — для автоблокировки).
- **Self-relation `ManagerClients`**: клиент ссылается на своего менеджера
  (`managerId` → `manager`; обратная сторона — `clients[]`). `onDelete: SetNull`.
- Связи: `warehouseAccess[]`, `orders[]`, `searchLogs[]`, `favorites[]`,
  `cartItems[]`, `returns[]`, `productViews[]`, `broadcastRecipients[]`, `discountRules[]`.

**`Product`** — каталог (upsert-ключ = `code` из 1С).
- `code` (уник.), `sku` (артикул), `name`, `fullName?` (применяемость),
  `brand?` (марка авто, выводится из `full_name`), `category?`.
- Цены: `price` `Decimal(12,2)`, `oldPrice?` (цена до последнего снижения),
  `priceDropAt?` (когда зафиксировано снижение), `isFinalPrice` (из 1С
  `is_final_price` — скидки клиента НЕ применяются), `imageUrl?`.
- Бейджи/закрепление: `newUntil?` (авто-«новинка»), `pinned`/`pinnedAt?`, `badge?`.
- Поиск/модель: `model?`/`modelNorm?`, `skuNorm?`, `fullNameNorm?` (нормализованные поля умного поиска).
- Индексы: B-tree на sku/brand/category/pinned/skuNorm/fullNameNorm/[brand,model]
  + **GIN trigram (`gin_trgm_ops`)** на sku/name/fullName/skuNorm/fullNameNorm
  (для `LIKE %q%`; требует расширение `pg_trgm`).

**`Warehouse`** — склады (`name` уник.). Реальные: «БК склад», «Car City склад»,
«БК склад 2», «Петя склад».

**`Stock`** — остаток товара по складу (`productId`+`warehouseId` уник., `qty`).

**`ClientWarehouseAccess`** — какие склады видит конкретный клиент
(`userId`+`warehouseId` уник.).

**`Order`** — `userId`, `status` (`OrderStatus`), `comment?`, `total`, `paid`
(долг = total − paid), `debtApplied` (долг зачислен в баланс один раз при ISSUED),
`onecSent`/`onecNumber?` (выгрузка в 1С). Связь `items[]`.

**`OrderItem`** — `orderId`, `productId?`, и **снимки на момент заказа**:
`sku`, `name`, `price`, `qty`. `product` `onDelete: SetNull`.

**`SearchLog`** — теневой лог поисковых запросов: `query`, `resultsCount`, `userId?`.

**`Return`** — возвраты (**НЕ выгружаются в 1С**). `id` — `Int autoincrement` (=номер возврата),
`userId?`, `productId?`, `code?`, `sku`, `name`, `brand?`, `qty`, `price`,
`warehouseName?`, `reason?`, `comment?`, `status` (`ReturnStatus`).

**`Favorite`** — избранное (`userId`+`productId` уник.).

**`SavedCartItem`** — сохранённые корзины (для видимости в админке; `userId`+`productId` уник., `qty`).

**`ProductView`** — статистика просмотров карточек (`productId`, `userId?`).

**`Analog`** — аналоги из импорта `.xlsx`: `code` (что вбивают в поиск),
`brand?`, `sku` (артикул товара в каталоге, который надо показать).

**`Setting`** — key/value-настройки (глобальная скидка, текст блокировки,
интервал синхронизации, режим отображения скидок и т.д.).

**`Broadcast`** / **`BroadcastProduct`** / **`BroadcastRecipient`** — рассылки.
`Broadcast.isGlobal` (true=всем; иначе по `recipients`), `text`, `title?`,
товары-вложения, получатели с `readAt?` (трекинг прочтения).

**`DiscountRule`** / **`DiscountRuleProduct`** — адресные скидки.
`percent` (1..95), `userId?` (null = всем клиентам), `target` (`DiscountTarget`),
`category?` / `brand?` (по таргету), `active`, m2m-товары через `DiscountRuleProduct`.
При расчёте берётся **наибольший** подходящий процент; снижение цены из 1С прибавляется сверху.

### Миграции (`prisma/migrations/`) — 11 шт.
```
20260602124013_init
20260605130640_admin_expansion
20260605133116_order_debt_applied
20260606120139_pins_badges_discounts_broadcasts
20260606123038_broadcast_is_global
20260606184448_product_model
20260608104701_discount_rules
20260610201408_trgm_search_indexes        ← pg_trgm GIN (CREATE EXTENSION впереди SQL)
20260611141053_auto_block_badges_pricedrop
20260612211254_product_is_final_price
20260613094257_roles_ra_accountant         ← ALTER TYPE "Role" ADD VALUE 'RA' / 'ACCOUNTANT'
```

---

## 3. Реализованный функционал (UI/UX)

### Структура приложения
- **`app/(portal)/`** — клиентская часть: `page.tsx` (лендинг с hero + сетка
  брендов + блок «Контакты» секцией `#contacts`), `catalog/`, `cart/`, `orders/`,
  `returns/`, `favorites/`, `broadcasts/[id]`, `contacts` (redirect на `/#contacts`),
  `layout.tsx` (общий каркас: Sidebar + Header + main), `loading.tsx` (скелетон переходов).
- **`app/(portal)/admin/`** — админка: `page.tsx` (обзор/дашборд), `orders/`,
  `returns/`, `clients/`, `discounts/`, `broadcasts/`, `analogs/`, `stats/`,
  `activity/`, `search-logs/`, `settings/`.
- **`app/login/`**, **`app/api/`**, **`middleware.ts`** (RBAC + auth-гейт),
  **`instrumentation.ts`** (старт планировщиков).

### Каталог (`components/Catalog.tsx`)
- **Сетка/список** (по умолчанию — **grid**), Lightbox (увеличение фото),
  пагинация (50/стр.), сортировка (`price_asc|price_desc`), фильтры (марка/категория/цена/в наличии).
- **Карточка товара (grid):** фото, артикул, применяемость, бейджи-пилюли
  (НОВИНКА `bg-green-500`+Star / ХИТ ПРОДАЖ `bg-amber-500`+Flame), цена-блок
  (зачёркнутая старая + красная пилюля −N% + крупная цена).
- **Состояние «в корзине»** выводится из стора (не мигает): нет в корзине →
  красная «В корзину» (h-9, 36px); в корзине → минималистичный селектор
  количества `[−] число [+]` с **редактируемым input** (оптовик может вписать
  кол-во вручную; − на qty 1 удаляет). Обе высоты строго 36px (карточка не прыгает).
- **CSS-тултип** для длинных описаний (только при `desc.length > 60`).
- **Нет в наличии** (`totalQty===0`): кнопка становится серой disabled «Нет в наличии»
  (избранное всё равно доступно).
- **Скрытие нулевых цен** при сортировке по цене (`price > 0`).
- Админ-инлайн-контролы (закрепить/бейдж) видны при `canEditCatalog(role)` (ADMIN|RA).
- `CartQtySelector` вынесен в `components/CartQtySelector.tsx` (используется Catalog + FavoritesClient).

### Умный поиск
- Нормализованные поля `skuNorm`/`fullNameNorm` (убраны разделители) + `normalizeSmart(q)`;
  `normalizeCode` в аналогах тоже убирает дефисы → «zeekr 9x» = «zeekr9x» = «zeekr-9x».
- Поиск по аналогам: совпавшие по `Analog` артикулы добавляются в выдачу с бейджем `viaAnalog`.
- Поиск НЕ матчит `brand` (марка и так в `full_name`; марка остаётся фасетным фильтром).
- **Фильтр по модели**: выбор модели делает ТЕКСТОВЫЙ поиск в `full_name`
  (как если бы напечатали слово) — раньше был точный матч по фрагментированному
  `Product.model` и сильно недобирал. `/api/products/models?make=` отдаёт чистые
  базовые имена моделей (`baseModel()`) с реальными счётчиками по видимым товарам.

### Клиентские фичи
- **Блок «Ваш менеджер»**: layout грузит у клиента `balance` + `manager{fullName,phone,email}`;
  Header в дропдауне телефона показывает ФИО/tel/mail/WhatsApp (`wa.me`), зелёная WA-кнопка ведёт к менеджеру.
- **Баланс** в Sidebar: пилюля над футером — «Долг» (красная `bg-accent/20`) при < 0, иначе «Баланс».
- **Страница «Избранное»** (`/favorites`, `FavoritesClient`): карточки в стиле
  каталога, сердечко удаляет, контролы корзины переиспользованы.
- **Корзина** (`components/Cart.tsx`): показывает скидки (зачёркнутая старая цена,
  −N% пилюля, «Ваша скидка −X ₸»). Корзина персистится через `CartSync` (только CLIENT) → видна в админке.
- **«Повторить заказ»** (`RepeatOrderButton`): через `/api/cart/resolve` собирает
  позиции по СЕГОДНЯШНИМ ценам, пропускает удалённые/отсутствующие (toast «N позиций пропущено»), редиректит в `/cart`.
- **Toast-слой** (`store/toast.ts` + `components/Toasts.tsx`, fixed bottom-right).
- **Хоткей «/»** фокусирует поиск в Header (с подсказкой `<kbd>/</kbd>`, Esc — blur).
- **BlockOverlay**: при `CLIENT && !isActive` показывается оверлей блокировки
  (текст из `Setting blocked_message` + контакты менеджера).
- **Рассылки** (`BroadcastBell`): колокольчик с непрочитанными, авто-поллинг (45с)
  и авто-поп при новой рассылке; рассылки с товарами открываются как
  **полноценная страница каталога** `/broadcasts/[id]`.

### Админка
- **Клиенты** (`ClientsManager`): баланс/город/комментарий/дата рег./ID, скидка %, блокировка (`isActive`), доступ к складам.
- **Заказы** (`OrdersAdmin`): фильтры, инлайн-правка статуса и `paid`; при ISSUED долг (total−paid) зачисляется в баланс один раз (`debtApplied`).
- **Возвраты** (`ReturnsAdmin` + клиентский `ReturnsClient`).
- **Скидки** (`DiscountsManager`): процент, область (всем/клиенту), таргет (товар/категория/бренд/все), активность.
- **Рассылки** (`BroadcastsManager`): создание/правка, пикеры товаров и получателей.
- **Аналоги** (`AnalogsManager`): импорт `.xlsx`, список, правка/удаление.
- **Статистика** (`/admin/stats`): топ покупаемых/искомых/просматриваемых.
- **Активность** (`/admin/activity`): корзины + избранное по клиентам.
- **Логи поиска** (`/admin/search-logs`): история запросов, фильтр по клиенту.
- **Настройки** (`SettingsForm`): глобальная скидка, текст блокировки, интервал
  автосинхронизации (пресеты/cron), режим отображения скидки (% / сумма),
  автоматизация (auto_block_days / new_badge_days / price_drop_days; 0 = off).

### Производительность / сглаживание
- `lib/cache.ts` — in-process TTL-кэш (`cached`, `invalidatePrefix`): ключи
  `wh:<userId>`, `disc:<userId>`, `catalog:filters`, `catalog:models:<make>`, `cfg:*`.
  Инвалидация при синке / админ-записях.
- Каталог: сохранение прошлых строк при загрузке (`.loading-bar`, `.stale-fade`),
  скелетоны, session-кэш результатов (stale-while-revalidate), prefetch следующей
  страницы, debounce 300мс только на ввод (клики по фильтрам/пагинации — мгновенно),
  анимации `animate-fade-in-up`.

### Брендинг
- Логотипы: `public/logo-wide.jpg` (широкий) и `public/logo-compact.jpg` (квадратный),
  оба бело-на-чёрном JPEG → на тёмном фоне через **`mix-blend-screen`**.
  ⚠️ НЕЛЬЗЯ ставить `opacity<1` на blend-элемент/предков (чёрный фон вылезет коробкой).
- Favicon: `app/icon.png` + `app/favicon.ico` (из кропа `logo-compact`).

---

## 4. Бизнес-логика и интеграция с 1С

### Синхронизация с 1С
- **Источник:** `ONEC_API_URL = http://109.233.111.250:8888/hs/v1/products`
  (Basic-auth). Фид snake_case: `{code, sku, name, full_name, category, price,
  stocks:[{warehouse, qty}], image_url, is_final_price}`. ~5281 товаров, полный синк ≈6с.
- **Запуск:** `POST /api/sync` (кнопка в админке) или заголовок `X-Sync-Token: rival_sync_2026`.
  Раннер `lib/sync-runner.ts` (состояние на globalThis, без наложения ручного/авто).
  Статус: `/api/sync/status` + дашборд `SyncPanel`.
- **Парсинг (`lib/onec.ts`):** марка авто выводится из `full_name` (`detectMake`, ~48 марок)
  → `Product.brand` (поля «brand» в фиде нет). Модель — `detectModel`/`modelNorm`.
  `is_final_price` → `Product.isFinalPrice` (≈1718 true / 3569 false).
- **Логика цены при синке (minute-safe):** цена ВНИЗ → `oldPrice = max(prev.price, prev.oldPrice)`,
  `priceDropAt = now`; БЕЗ ИЗМЕНЕНИЙ → скидка сохраняется; ВВЕРХ → очищается.
  Новые товары получают `newUntil = now + new_badge_days`.
- **Автосинхронизация:** in-process `node-cron` из `instrumentation.ts`.
  `lib/scheduler.ts` `applySyncSchedule()` читает `Setting sync_cron` (DB важнее env;
  `"off"` выключает), пересоздаёт задачу на лету. Env: `SYNC_ENABLED`, `SYNC_CRON`
  (default `*/30 * * * *`). На проде (Vercel serverless) `SYNC_ENABLED=false` —
  in-process cron не работает, каталог обновляется вручную.
- **Скрытые папки 1С (`lib/categories.ts`):** категории `Unused` (1803) и
  `Архив папки` (126) — технический мусор, полностью исключены из каталога
  (`HIDDEN_CATEGORIES` / `NOT_HIDDEN_CATEGORY` / `visibleCategory()`).
  Видимых товаров ~3354 из 5283.

### Скидки (`lib/pricing.ts` — единственный источник истины)
- `priceFor(base, oldPrice, pct)` → `{price, oldPrice(зачёркнутая), discountPct}`.
  СУММИРУЕТ клиентский % + % снижения от синка (cap 95).
- `getDiscountContext(userId, role)` → `{pctFor(product)}` = **наибольшая** применимая
  клиентская скидка. Используется в search / broadcasts / orders (по позициям).
- Простые «ручки»: `User.discountPercent` + `Setting global_discount` (оба = таргет ALL).
- Адресные правила (`DiscountRule`): итог = **MAX** всех подходящих (global+personal+rules);
  снижение от 1С прибавляется сверху. Валидация — `lib/discount-rules.ts` (`normalizeRule`).
- ⚠️ `isFinalPrice` → обе ветки `pctFor` возвращают 0 (клиентская скидка НЕ применяется),
  но зачёркивание от снижения цены 1С всё равно работает (это собственная цена 1С).
- **Гейтинг снижения на отображении:** `dropActive` = `priceDropAt` в пределах
  `price_drop_days` вычисляется до `priceFor`.
- **Режим показа** (`Setting discount_display`: percent|amount): `formatDiscount()` в `lib/format.ts`.

### Заказы → 1С (`lib/onec-orders.ts`)
- `sendOrderToOneC` POST на `ONEC_ORDERS_URL` (env; иначе деривится из products-URL →
  `…/hs/v1/orders`), таймаут 20с, Basic-auth. `/api/orders` POST пере-считывает позиции
  с клиентской скидкой (total = со скидкой), ждёт ответ 1С, пишет `onecSent`/`onecNumber`.
  Payload: `{site_order_id, client_name, client_phone, comment, products:[{code,sku,qty,price}]}`.
- ✅ **Проверено вживую** — реальный тестовый заказ дошёл до 1С, вернулся `onecNumber 0000000000001807`.
- **Возвраты в 1С НЕ выгружаются.**

### Кэширование картинок (`lib/image-cache.ts`)
- Прокси `GET /api/image?u=…` (Basic-auth, SSRF-locked на origin 1С) — cache-first:
  пишет фото в `.image-cache/<id>` (gitignored), потом отдаёт с диска → фото переживают даунтайм 1С.
  На Vercel `CACHE_DIR → /tmp/rival-image-cache`.
- `image_url` из фида = `http://localhost:8888/...` → хост переписывается на origin 1С.
- Массовый прогрев: `POST /api/sync/images` (кнопка «Загрузить все фото в кэш»),
  с probe-гейтом (прерывается, если 1С недоступен). `GET /api/sync/images` → `{cached, withImage}`.
- ⚠️ Фид 1С **периодически флапает** (502 на /products и на картинках). Код обрабатывает
  (ошибка синка наружу, `<img>` → placeholder).

### RBAC (роли)
- `lib/permissions.ts` (Edge-safe, без prisma — для middleware + Sidebar):
  `SECTION_ROLES` (overview/orders/returns/clients/discounts/broadcasts/analogs/
  stats/activity/search-logs/settings), `canAccessSection`, `canAccessAdminPath`,
  `canEditCatalog` (ADMIN|RA), `seesAllClients`, `isStaff`, `landingSection`.
- **Матрица доступа:** ADMIN = всё; RA = всё, кроме «Настроек»; MANAGER = orders/
  returns/clients/discounts/broadcasts/analogs/stats/activity/search-logs;
  ACCOUNTANT = orders/returns/clients/stats/activity/search-logs.
- `lib/admin-scope.ts` (server-only): MANAGER видит ТОЛЬКО клиентов с `managerId===self`
  (`clientWhere`, `managerUserFilter`, `viaUserWhere`, `managerOwnsClient(s)`). Применяется
  во всех админ-разделах + by-id гарды (403 для чужого). MANAGER не может создавать
  глобальные скидки/рассылки; новый клиент менеджера авто-`managerId=self`; MANAGER-аккаунты создают только ADMIN/RA.
- ✅ Матрица проверена вживую.

---

## 5. Текущий статус и проблемы

### Где остановились
RBAC-раунд (роли RA + ACCOUNTANT, посекционный доступ, скоупинг клиентов по менеджеру)
**завершён и закоммичен** — `cb5b7f4` (HEAD). Все 11 миграций **применены локально**,
`prisma migrate status` локально = «Database schema is up to date!». Ветка `main`, рабочее дерево чистое.

Последние коммиты:
```
cb5b7f4 Roles: RA + ACCOUNTANT, per-section access, manager client-scoping
204ed44 Fix model filter: select model == text search in full_name
1aba4a7 1C is_final_price support + broadcasts open as full catalog pages
77b66fe B2B UX: repeat order, toast layer, "/" search hotkey
69f5435 Merge Contacts into the landing page
```

### 🔴 ПРИОРИТЕТ №1 для нового чата — миграция ролей не применена на ПРОДЕ (Neon)

**Суть:** локально всё применено и работает. Проблема — **прод-БД Neon отстаёт по
миграциям**. По состоянию проекта на Neon НЕ применены миграции после деплоя 2026-06-08:
- `20260610201408_trgm_search_indexes` (pg_trgm GIN-индексы);
- `20260611141053_auto_block_badges_pricedrop`;
- `20260612211254_product_is_final_price`;
- **`20260613094257_roles_ra_accountant`** ← главная: `ALTER TYPE "Role" ADD VALUE 'RA'` / `'ACCOUNTANT'`.

Пока эта enum-миграция не накатится на Neon, прод-схема не знает про роли RA/ACCOUNTANT,
а сид с пользователями `ra`/`accountant` упадёт.

**Что сделать (через DIRECT-URL Neon, НЕ pooled):**
1. `DATABASE_URL=<neon-DIRECT> npx prisma migrate deploy` — накатить все хвостовые миграции.
2. `DATABASE_URL=<neon-DIRECT> node prisma/seed.mjs` — добавить демо-юзеров `ra/ra123`, `accountant/accountant123`.
3. (опц.) пере-наполнить каталог снапшотом (синк локально против Neon-DIRECT, см. память — синк через Vercel serverless таймаутит).
4. `vercel deploy --prod` после готовности.

**Подводные камни enum-миграции (Postgres):**
- Миграция добавляет ДВА значения в enum за один шаг — это падает на PostgreSQL ≤11,
  но Neon = PG15, так что ок.
- В Postgres нельзя `ADD VALUE` в enum и тут же ИСПОЛЬЗОВАТЬ его в той же транзакции —
  поэтому сид с ролями RA/ACCOUNTANT должен идти **отдельным шагом** после `migrate deploy` (так и есть).
- ⚠️ Trigram-миграция требует `CREATE EXTENSION IF NOT EXISTS pg_trgm` (вшито в начало её SQL) —
  на Neon расширение должно подняться при deploy.

### Прочие известные «хвосты» / заметки
- ⚠️ Vercel-прод после раунда производительности (commit `786d8dc`) и последующих
  коммитов **не передеплоен** — нужен отдельный прогон деплоя по процедуре выше.
- `db-seed.sql` (проприетарный каталог/прайс) **гитигнорен и НИКОГДА не коммитится**
  ни в какой внешний remote (классификатор это жёстко блокирует).
- ⚠️ **Никогда не запускать `next build` при работающем `next dev`** — они делят `.next`,
  сайт теряет CSS. Для проверки типов — `npx tsc --noEmit`.
- ⚠️ `preview_screenshot` стабильно таймаутит на `/catalog` (network-idle не настаёт из-за
  тяжёлых фото) — каталог проверять через `preview_eval` (DOM-чтения).
- ⚠️ curl из Git Bash коверкает кириллицу в JSON-телах (для RU-текста использовать browser fetch).
- ⚠️ in-process кэш `catalog:models:<make>` (5 мин) переживает HMR — для проверки
  изменений роута перезапускать dev-сервер.
- Warning Prisma «package.json#prisma is deprecated» — учесть при будущем апгрейде до v7.

### Карта файлов (быстрый старт в новом чате)
- Схема/миграции: `prisma/schema.prisma`, `prisma/migrations/`, сид `prisma/seed.mjs`.
- Ядро логики: `lib/pricing.ts`, `lib/discount-rules.ts`, `lib/permissions.ts`,
  `lib/admin-scope.ts`, `lib/onec.ts`, `lib/onec-orders.ts`, `lib/sync-runner.ts`,
  `lib/scheduler.ts`, `lib/maintenance.ts`, `lib/cache.ts`, `lib/categories.ts`,
  `lib/image-cache.ts`, `lib/jwt.ts`, `lib/auth.ts`, `lib/settings.ts`, `lib/format.ts`.
- Auth/гейт: `lib/jwt.ts` + `middleware.ts`.
- UI: `components/Catalog.tsx` (+ `CartQtySelector`, `CategoryTree`, `FavoritesClient`,
  `BroadcastBell`, `Cart`, `Sidebar`, `Header`, `Toasts`, `BlockOverlay`, `RepeatOrderButton`),
  `components/admin/*`.
- API: `app/api/**/route.ts` (sync, products/search|filters|models, orders, cart[/resolve],
  favorites, returns, broadcasts, image, track/view, admin/*).
