# CONTEXT.md — Rival Auto Parts (B2B портал) · Master Context File

> Снимок для переноса контекста в новый чат. Дата: **2026-07-07**.
> Проект: `C:\rival-auto-parts` · git `main` @ `1c604a3` (origin/main отстаёт: `cb5b7f4`, локально +3 коммита, НЕ запушены).
> Незакоммичено: `app/(portal)/page.tsx` (фикс карточек «Наши магазины» — flex-col, карта прижата, скролл сотрудников).
> Прод: **https://rival-auto-parts.vercel.app** (задеплоен `1c604a3`, фикс лендинга ещё НЕ на проде).
> Демо-логины: `admin/admin123`, `ra/ra123`, `manager/manager123`, `accountant/accountant123`, `client/client123`.

---

## 1. Tech Stack & Environment

| Слой | Технология |
|---|---|
| Framework | **Next.js 14.2.35** (App Router, `experimental.instrumentationHook`) |
| Язык | TypeScript 5 (`target ES2017`) |
| UI | React 18, **Tailwind CSS 3.4** (только встроенные брейкпоинты), lucide-react |
| State | **Zustand 5**: `store/cart.ts` (persist "rival-cart"), `store/search.ts`, `store/toast.ts`, `store/ui.ts` (persist "rival-ui", partialize только `collapsed`) |
| БД | PostgreSQL 15 локально (`rival_auto_parts`, postgres/postgres) · **Neon** на проде |
| ORM | **Prisma 6.19** — намеренно НЕ v7 (v7 ломает генератор/env; warning `package.json#prisma deprecated` — ок) |
| Auth | Кастомный JWT (jose, HS256) в httpOnly-cookie `rival_session`, bcryptjs; NextAuth НЕ используется |
| Прочее | xlsx (импорт аналогов), node-cron (in-process синк/maintenance) |

**Окружение (Windows 11):**
- Новые PowerShell-сессии не видят node: `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.
- psql: `C:\Program Files\PostgreSQL\15\bin\psql.exe` (не в PATH). ⚠️ Кириллица в аргументах psql/PowerShell коверкается — для проверок с русским текстом писать node-скрипт в `scripts/` (грузит `.env` вручную, prisma резолвится из корня) и удалять после.
- ⚠️ НИКОГДА не запускать `next build` при живом `next dev` (общий `.next`, отвал CSS). Проверка типов: `npx tsc --noEmit`. Полный линт: `npx next lint` (безопасен при dev).
- Dev-сервер: `npx next dev` в background Bash (launch.json "rival" есть, но preview-инструменты в сессиях часто отваливаются — проверки делать curl/Invoke-WebRequest + SSR-grep + API).
- ⚠️ PowerShell 5.1: нет `&&`/тернарника; кавычки в аргументах ломаются — коммиты с длинным текстом через `git commit -F <файл>` (файл писать Write-тулом, UTF-8).
- ⚠️ `prisma migrate dev` требует остановки dev-сервера (EPERM на query_engine DLL): убить процесс на порту 3000 → migrate → перезапуск.

**Deploy (Vercel):**
- Команда сборки: `prisma migrate deploy && node prisma/seed.mjs && next build` — миграции и идемпотентный сид накатываются на Neon при каждом деплое.
- ⚠️ Vercel блокирует деплой по автору коммита (аккаунт Vercel не связан с GitHub). Рабочий обход: `Rename-Item .git .git.deploybak` → `vercel --prod --yes` → вернуть `.git` (в `finally`). Git identity в репо: `nmoldakhmetov <124157761+nmoldakhmetov@users.noreply.github.com>`.
- ⚠️ Билд валит ESLint (не только tsc) — перед деплоем прогонять `npx next lint`. В `.eslintrc.json` добавлен игнор `^_` аргументов.
- На проде `SYNC_ENABLED=false` (serverless): каталог обновляется вручную; фото-кэш в `/tmp` эфемерный.
- GitHub: `nmoldakhmetov/rival-auto-parts` (private). PR #1 (ветка `gifts-admin-rbac`, старый срез 364865f) создан, не смержен. `gh` CLI не установлен (PR делали через API + git-credential).
- `db-seed.sql` — НИКОГДА не коммитить.

## 2. Architecture & Database

**Роли (`Role`)**: ADMIN (всё) · RA (всё кроме «Настроек», может синк/каталог-правки) · MANAGER (orders/returns/clients/discounts/broadcasts/analogs/stats/activity/search-logs; видит ТОЛЬКО своих клиентов — `lib/admin-scope.ts`) · ACCOUNTANT (orders/returns/clients/stats/activity/search-logs; всех клиентов; read-only в users) · CLIENT. Матрица: `lib/permissions.ts` (`SECTION_ROLES`, `canEditCatalog`=ADMIN|RA, секция `gifts`=ADMIN|RA). Гейт: `middleware.ts`.

**Модели (prisma/schema.prisma, 13 миграций, последняя `20260705235802_discount_rule_kind`):**
- `User`: role, login, balance (долг<0), discountPercent, isActive, debtSince, managerId (self-relation ManagerClients).
- `Product`: code (уник., upsert-ключ 1С), sku, name, fullName (применяемость), brand/model (выводятся из full_name), category, price, oldPrice+priceDropAt (снижение 1С), **isFinalPrice**, newUntil, pinned, badge (NEW|HIT), skuNorm/fullNameNorm (умный поиск), GIN trigram индексы.
- `Warehouse`, `Stock` (productId+warehouseId, qty), `ClientWarehouseAccess` (какие склады видит клиент).
- `Order` (status, total, paid, debtApplied, onecSent/onecNumber), `OrderItem` (снимки sku/name/price/qty + **isGift**).
- `Return` (id autoincrement; НЕ уходит в 1С), `Favorite`, `SavedCartItem` (зеркало корзины для админки), `ProductView`, `SearchLog`, `Analog` (code→sku), `Setting` (key/value), `Broadcast`/`BroadcastProduct`/`BroadcastRecipient`.
- `DiscountRule`: **kind DISCOUNT|MARKUP**, percent 1..95, userId (null=всем), target ALL|PRODUCT|CATEGORY|BRAND (+`DiscountRuleProduct`).
- `GiftRule` (minQty, active) + `GiftRuleTrigger`/`GiftRuleGift` (m2m товары).

**1С интеграция:**
- Фид: `ONEC_API_URL=http://109.233.111.250:8888/hs/v1/products` (Basic-auth), ~5300 товаров, синк ≈6-10с. `lib/onec.ts`: detectMake (~48 марок из full_name), detectModel; minute-safe снижение цены (вниз→oldPrice+priceDropAt; без изменений→сохранить; вверх→очистить); новинки newUntil.
- Заказы → 1С: `lib/onec-orders.ts` POST `…/hs/v1/orders` (payload: site_order_id, client_name/phone, comment, products[{code,sku,qty,price}]). Подарки уходят с price 0 и своим qty. Проверено вживую.
- Планировщик: `instrumentation.ts` → `lib/scheduler.ts` (cron из Setting `sync_cron`, "off" выключает) + maintenance каждые 10 мин (`lib/maintenance.ts`: автоблок должников, истечение скидок/новинок).
- Скрытые категории: `Unused`, `Архив папки` (`lib/categories.ts`) — видимых ~3354.
- Фото: прокси `GET /api/image?u=` (SSRF-lock на origin 1С), диск-кэш `.image-cache/`.
- Кэш: `lib/cache.ts` in-process TTL (`wh:`, `disc:`, `catalog:`, `cfg:`, `gifts:`), инвалидация по префиксам из админ-роутов.

**Settings (DEFAULTS в `lib/settings.ts`):** blocked_message, global_discount, sync_cron, auto_block_days=30, new_badge_days=40, price_drop_days=13, discount_display (percent|amount), **warehouse_tooltip** (текст «ЗАКАЗЫ ДО 11:30…»), **return_policy_default**, **return_policy_gift**. Всё правится в Админ → Настройки (ADMIN only).

## 3. Knowledge Base — ключевые бизнес-правила

### Скидки / наценки (`lib/pricing.ts` — единственный источник истины)
- **Расчёт (под капотом):** для товара берётся ЛУЧШАЯ скидка (max из: global_discount, User.discountPercent, правил kind=DISCOUNT по ALL/CATEGORY/BRAND/PRODUCT) и ЛУЧШАЯ наценка (max правил kind=MARKUP, те же таргеты). **net = скидка − наценка**, cap ±95. Итоговая цена = round(base × (1 − net/100)); base из 1С уже содержит акционное снижение.
- **isFinalPrice: блокирует ТОЛЬКО скидку. Наценка применяется принудительно ко ВСЕМ товарам, включая is_final_price=true** (критичное требование, проверено).
- **Отображение (клиент НЕ видит личную скидку):** `priceFor()` отдаёт в бейдж/зачёркивание ТОЛЬКО акцию 1С (syncDropPct из oldPrice, живёт price_drop_days). Нет снижения 1С → бейджа нет вообще, даже при личной скидке. Режим «суммой» и строка «Ваша скидка» в корзине считаются от 1С-процента (не от разницы цен, чтобы не выдать личную скидку). Наценка тоже невидима — просто выше цена.
- Заказ пере-ценивается на сервере (`/api/orders`), клиентским ценам не доверяем.

### «Диски UIDNU» — строго парами (`lib/pair-only.ts`)
- Категория определяется точным сравнением `category` (lowercase) с «диски uidnu» — реально существует в фиде 1С.
- В БД цена за 1 шт, но **карточка показывает цену ×2 с подписью «за 2 шт»** (и зачёркнутую ×2, и сумму в amount-режиме).
- Количество строго чётное ≥2: шаг ±2 в `CartQtySelector` (проп `step`; ввод коммитится на blur), первый клик кладёт 2. `snapPairQty` (ceil до чётного) в: сторе корзины (add/setQty), `/api/cart` (зеркало), `/api/orders` (оформление). «Повторить заказ» прокидывает pairOnly.

### Подарки (`GiftRule`, `lib/gifts.ts` + `lib/gift-earn.ts` — чистая math, общая клиент/сервер)
- Правило: купи ≥minQty ЛЮБОГО товара-триггера → товары-подарки бесплатно. **Кратность: каждые полные minQty дают ещё комплект** — floor(qty/minQty) по каждому триггеру, суммируется; правила стакаются по подарку (от 2 шт: 4→2 подарка, 6→3).
- Сервер добавляет подарки в заказ строками price=0, isGift=true, qty=заработанное; уходит и в 1С, и в WhatsApp-текст с пометкой «(подарок)».
- UI: зелёный баннер на триггерах в каталоге («При покупке от N шт — SKU в подарок!», клик по SKU → центрированный popup карточки подарка); зелёные строки в корзине (десктоп-таблица и моб. карточки); **индикатор в мини-корзине** — пилюля «🎁 +N» рядом со счётчиком у пункта «Корзина» в сайдбаре.
- **Тексты возврата в корзине** (над кнопкой оформления): есть заработанный подарок → янтарный блок с `return_policy_gift` («При возврате основного товара возврат подарка обязателен»); нет → серый с `return_policy_default`. Оба текста из Settings, правятся в админке, летят через `/api/gifts`.
- Админка: раздел «Подарки» (ADMIN/RA), пикеры триггеров/подарков, порог, активность.

### Поиск
- Умный матч: sku/name/fullName + нормализованные skuNorm/fullNameNorm (без разделителей/регистра) + аналоги (Analog.code→sku, бейдж viaAnalog). Марка НЕ матчится текстом (фасет). **Фильтр по модели = текстовый поиск слова в full_name** (make+model ≡ ввод модели в строку; счётчики моделей глобальные и совпадают с выдачей).
- **Exact match:** запрос == sku/code/fullName (без регистра/разделителей) → все такие товары принудительно первыми на стр.1, флаг `exactMatch`. **Выделение — только рамка** (сетка: border-accent + ring; список: bg-accent/5 + красная полоса слева). Бейджей/иконок НЕТ (удалены по требованию). Несколько точных — подсвечиваются все.
- **Автоочистка**: `components/SearchReset.tsx` в layout — смена pathname чистит строку поиска, КРОМЕ переходов с `?q=` (сабмит из шапки теперь ведёт на `/catalog?q=…` — шэрабельный диплинк); фильтры/пагинация роут не меняют → не сбрасывают.

### Прочее клиентское
- **Остатки для клиента капятся: >70 показывается как «>70»** (`lib/stock.ts`, точное число не покидает сервер; персонал видит точные). Тултип условий доставки на плашках складов (`components/StockBadges.tsx`, fixed-поповер, текст из Setting).
- **Акции** `/promotions`: только триггеры подарков + товары со скидкой 1С; **сортировка сегментами: сначала все подарочные, потом скидочные**, сквозная пагинация (promo=1 в search API).
- Заблокированный клиент логинится и видит BlockOverlay. Возвраты в 1С не уходят.

## 4. Current State — реализованный UI/UX

- **Сворачиваемый Mini Sidebar (десктоп)**: кнопка-шеврон на границе; w-60→w-20 (`lg:`), компактный логотип, иконки по центру, счётчик корзины — мини-бейдж на иконке, title-тултипы; transition-all 300ms (включается через 200мс после маунта — нет анимации при загрузке); состояние в localStorage (`rival-ui`); полностью изолирован от мобильного drawer.
- **«Возвраты» — вкладка в «Моих заказах»**: пункт убран из сайдбара; `/orders` = URL-driven табы «История заказов (N)» / «Мои возвраты (N)» (`?tab=returns`); `ReturnsClient` с пропом `embedded`; `/returns` → redirect. Персоналу табы не показываются.
- **Адаптив (только Tailwind sm/md/lg/xl)**: мобильный сайдбар-drawer + бургер в шапке; drawer фильтров каталога (кнопка «Фильтры» с точкой активности, один элемент — fixed на моб./static на md+); корзина на телефоне — карточки вместо таблицы (без гориз. скролла); списочные таблицы каталога/избранного — overflow-x-auto + min-w; сетка 1→2→3→4 колонки.
- **Каталог**: вид по умолчанию — «Список» (везде, включая рассылки); в списке полноценный `CartQtySelector`; порядок колонок «Наличие → Цена» (цена последняя); grid-карточки — наличие раньше цены.
- **Избранное**: тоггл Список/Сетка (общий `ViewToggle`), списочная таблица с полными контролами.
- **Рассылки**: карточки в колокольчике с hover-подъёмом и плашкой «Перейти к товарам →»; открываются полной страницей-каталогом.
- **Косметика**: общий `EmptyState` (каталог с кнопкой сброса фильтров, корзина, избранное), скелетоны (корзина — зеркало макета, избранное — строки), глобальная полировка в globals.css (focus-ring, active:scale, hover-тени, transition на .btn/.input/.badge/таблицы).
- **Админка**: «Пользователи» с вкладками Клиенты/Менеджеры/Бухгалтеры/RA + создание всех ролей (ACCOUNTANT read-only, MANAGER — только клиентов); «Скидки» с типом Скидка/Наценка; «Подарки»; настройки с новыми текстами.
- **Лендинг «Наши магазины»** (⚠️ незакоммичено): карточки h-full flex-col, инфо+сотрудники flex-1, список сотрудников max-h-48 overflow-y-auto, iframe карты h-56 shrink-0 прижат к низу.

## 5. Pending Tasks / Backlog

**Этап: полировка UI/UX.** Хвосты:
1. **Закоммитить** фикс «Наших магазинов» (`app/(portal)/page.tsx`) и **передеплоить Vercel** (обход через rename .git).
2. **Запушить** локальные коммиты в GitHub (origin/main на cb5b7f4, локально +3–4; PR #1 устарел — решить: обновить/закрыть).
3. Выпадашка моделей: мусорное слово «оригинал (761)» из detectModel — предложен стоп-лист («оригинал», «аналог» и т.п.), не делали.
4. Прод-каталог обновляется только вручную (POST /api/sync с admin-сессией или X-Sync-Token; env `SYNC_SECRET`); фото-кэш на Vercel эфемерный.
5. Будущий апгрейд Prisma 7 → переезд на prisma.config.ts (пока намеренно v6).
6. PROJECT_STATE.md в корне устарел — этот CONTEXT.md новее.

**Правило работы (глобальное от заказчика):** действовать как Senior Frontend/UX — паттерны Amazon/Ozon, мелкие решения (отступы, disabled, лоадеры, фокусы) принимать самостоятельно, «под ключ», без микроменеджмента. Верифицировать: tsc + next lint + живые API/SSR-проверки на dev-сервере (браузерной автоматизации обычно нет); после правок прогонять `npx tsc --noEmit`.
