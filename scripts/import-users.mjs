// Импорт менеджеров и клиентской базы со старого сайта.
//
// Пароли НЕ хранятся в этом файле — передаются через переменные окружения,
// чтобы не попасть ни в git, ни в историю команд.
//
//   PowerShell:
//     $env:MANAGER_PASSWORD="…"; $env:CLIENT_PASSWORD="…"
//     node scripts/import-users.mjs --managers --clients "C:\путь\База.xlsx"
//     node scripts/import-users.mjs --managers --clients "C:\путь\База.xlsx" --yes
//
//   bash:
//     MANAGER_PASSWORD=… CLIENT_PASSWORD=… node scripts/import-users.mjs --managers
//
// По умолчанию — только отчёт, ничего не меняется. Применение: флаг --yes.
//
// Повторный запуск безопасен: существующие аккаунты обновляются по профилю
// (ФИО, телефон, почта, населённый пункт, менеджер, склады), а ПАРОЛЬ у них
// не трогается. Перезадать пароли существующим — флаг --reset-passwords.
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

for (const f of ["../.env", "../.env.local"]) {
  try {
    for (const line of readFileSync(new URL(f, import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const argv = process.argv.slice(2);
const apply = argv.includes("--yes");
const resetPasswords = argv.includes("--reset-passwords");
const doManagers = argv.includes("--managers");
const clientsIdx = argv.indexOf("--clients");
const clientsFile = clientsIdx !== -1 ? argv[clientsIdx + 1] : null;
const BCRYPT_ROUNDS = 10;

// ФИО / телефон / почта — рабочие контакты, они и так есть в клиентской базе.
const MANAGERS = [
  { login: "manager", fullName: "Адукаримов Рустам", phone: "+7(776)710-30-14", email: "rivalautokz.1@gmail.com" },
  { login: "manager2", fullName: "Хамдамов Едгор", phone: "+7(776)710-30-13", email: "rauto.manager.2@gmail.com" },
  { login: "manager3", fullName: "Антон", phone: "+7(776)710-30-12", email: "rauto.manager.5@gmail.com" },
  { login: "manager4", fullName: "Равиль", phone: "+7(776)710-30-17", email: "rav_cartoyo@mail.ru" },
  { login: "Bakorda", fullName: "Махмут", phone: "+7(776)710-30-17", email: "rauto.manager.3@gmail.com" },
  { login: "CarCity", fullName: "Рафи", phone: "+7(776)293-56-30", email: "rauto.manager.4@gmail.com" },
];

const prisma = new PrismaClient();
const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База:   ${host}`);
console.log(`Режим:  ${apply ? "ЗАПИСЬ" : "проверка (--yes для применения)"}`);
if (resetPasswords) console.log("        + перезадать пароли существующим");
console.log();

const stats = { mgrCreated: 0, mgrUpdated: 0, cliCreated: 0, cliUpdated: 0, skipped: [] };

// ─── Менеджеры ──────────────────────────────────────────────────────────────
if (doManagers) {
  const pw = process.env.MANAGER_PASSWORD;
  if (!pw) {
    console.error("✗ Не задан MANAGER_PASSWORD");
    process.exit(1);
  }
  console.log("── МЕНЕДЖЕРЫ ──");
  for (const m of MANAGERS) {
    const existing = await prisma.user.findUnique({ where: { login: m.login } });
    if (existing) {
      console.log(`  = ${m.login.padEnd(10)} ${m.fullName} — обновляю профиль${resetPasswords ? " + пароль" : ""}`);
      stats.mgrUpdated++;
      if (apply) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: "MANAGER",
            fullName: m.fullName,
            phone: m.phone,
            email: m.email,
            isActive: true,
            ...(resetPasswords ? { passwordHash: bcrypt.hashSync(pw, BCRYPT_ROUNDS) } : {}),
          },
        });
      }
    } else {
      console.log(`  + ${m.login.padEnd(10)} ${m.fullName} — создаю`);
      stats.mgrCreated++;
      if (apply) {
        await prisma.user.create({
          data: {
            role: "MANAGER",
            login: m.login,
            fullName: m.fullName,
            phone: m.phone,
            email: m.email,
            passwordHash: bcrypt.hashSync(pw, BCRYPT_ROUNDS),
          },
        });
      }
    }
  }
  console.log();
}

// ─── Клиенты ────────────────────────────────────────────────────────────────
if (clientsFile) {
  const pw = process.env.CLIENT_PASSWORD;
  if (!pw) {
    console.error("✗ Не задан CLIENT_PASSWORD");
    process.exit(1);
  }

  const wb = XLSX.read(readFileSync(clientsFile), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
  });
  const body = rows.slice(1); // первая строка — заголовки
  const cell = (r, i) => String(r[i] ?? "").trim();

  // Склады: сопоставляем по имени без учёта регистра, чиним «склад склад».
  const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
  const whByName = new Map(warehouses.map((w) => [w.name.toLowerCase(), w.id]));
  const resolveWarehouses = (raw) => {
    const ids = [];
    const unknown = [];
    for (let part of raw.split(",")) {
      part = part.trim().replace(/\s+склад\s+склад$/i, " склад");
      if (!part) continue;
      const id = whByName.get(part.toLowerCase());
      if (id) ids.push(id);
      else unknown.push(part);
    }
    return { ids: [...new Set(ids)], unknown };
  };

  // Менеджеры: в файле указаны по ФИО.
  const mgrRows = await prisma.user.findMany({
    where: { role: "MANAGER" },
    select: { id: true, fullName: true },
  });
  const mgrByName = new Map(mgrRows.map((m) => [m.fullName.trim().toLowerCase(), m.id]));
  // В режиме проверки менеджеров ещё не создали — учитываем тех, кого создаст
  // этот же запуск, иначе отчёт зря сообщает о «ненайденных» менеджерах.
  if (doManagers && !apply) {
    for (const m of MANAGERS) {
      const key = m.fullName.trim().toLowerCase();
      if (!mgrByName.has(key)) mgrByName.set(key, `(будет создан: ${m.login})`);
    }
  }

  // ⚠ Логины сотрудников защищены: в присланной базе есть клиенты с логинами
  // «Bakorda» и «CarCity», которые в списке менеджеров закреплены за Махмутом
  // и Рафи. Без этой защиты импорт клиентов молча превращал менеджера в
  // клиента (роль, ФИО и пароль перезаписывались).
  const staffLogins = new Set(
    (
      await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"] } },
        select: { login: true },
      })
    ).map((u) => u.login.toLowerCase())
  );
  if (doManagers) for (const m of MANAGERS) staffLogins.add(m.login.toLowerCase());

  // Почта уникальна на весь портал: если её уже занял кто-то другой, клиента
  // всё равно завозим, но без почты — потерять клиента хуже, чем адрес.
  const emailOwner = new Map(
    (
      await prisma.user.findMany({
        where: { email: { not: null } },
        select: { email: true, login: true },
      })
    ).map((u) => [u.email.toLowerCase(), u.login])
  );
  if (doManagers) {
    for (const m of MANAGERS) emailOwner.set(m.email.toLowerCase(), m.login);
  }

  console.log(`── КЛИЕНТЫ (${body.length} строк из файла) ──`);
  const unknownWh = new Set();
  const unknownMgr = new Set();
  const loginClashes = [];
  const emailClashes = [];
  let shown = 0;

  for (const r of body) {
    const login = cell(r, 1);
    const fullName = cell(r, 2);
    if (!login || !fullName) {
      stats.skipped.push(`строка без логина/ФИО: ${JSON.stringify(r).slice(0, 80)}`);
      continue;
    }
    const whRaw = cell(r, 3);
    const mgrName = cell(r, 4);
    const city = cell(r, 5);
    const phone = cell(r, 6);
    const email = cell(r, 7);

    // Логин занят сотрудником — не трогаем, иначе менеджер станет клиентом.
    if (staffLogins.has(login.toLowerCase())) {
      loginClashes.push(`${login} («${fullName}») — логин занят сотрудником`);
      continue;
    }

    const { ids: whIds, unknown } = resolveWarehouses(whRaw);
    unknown.forEach((u) => unknownWh.add(u));
    const managerId = mgrByName.get(mgrName.toLowerCase()) ?? null;
    if (mgrName && !managerId) unknownMgr.add(mgrName);

    const existing = await prisma.user.findUnique({ where: { login } });

    // Почта уже за кем-то другим → заводим клиента без почты.
    let emailToUse = email || null;
    if (emailToUse) {
      const owner = emailOwner.get(emailToUse.toLowerCase());
      if (owner && owner.toLowerCase() !== login.toLowerCase()) {
        emailClashes.push(`${login}: ${emailToUse} уже у «${owner}» → импортирую без почты`);
        emailToUse = null;
      } else {
        emailOwner.set(emailToUse.toLowerCase(), login);
      }
    }

    const profile = {
      role: "CLIENT",
      fullName,
      phone: phone || null,
      email: emailToUse,
      city: city || null,
      managerId,
      isActive: true,
    };

    if (shown < 5) {
      console.log(
        `  ${existing ? "=" : "+"} ${login.padEnd(14)} ${fullName.padEnd(28).slice(0, 28)} ` +
          `${(mgrName || "—").padEnd(18)} складов: ${whIds.length}`
      );
      shown++;
    }

    if (existing) stats.cliUpdated++;
    else stats.cliCreated++;

    if (!apply) continue;

    try {
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              ...profile,
              ...(resetPasswords ? { passwordHash: bcrypt.hashSync(pw, BCRYPT_ROUNDS) } : {}),
            },
          })
        : await prisma.user.create({
            data: { ...profile, login, passwordHash: bcrypt.hashSync(pw, BCRYPT_ROUNDS) },
          });

      // Доступ к складам пересобираем под файл.
      await prisma.clientWarehouseAccess.deleteMany({ where: { userId: user.id } });
      if (whIds.length) {
        await prisma.clientWarehouseAccess.createMany({
          data: whIds.map((warehouseId) => ({ userId: user.id, warehouseId })),
        });
      }
    } catch (e) {
      const msg = e?.code === "P2002"
        ? `конфликт уникальности (${(e.meta?.target ?? []).join(", ")})`
        : String(e?.message ?? e).slice(0, 120);
      stats.skipped.push(`${login}: ${msg}`);
      if (existing) stats.cliUpdated--;
      else stats.cliCreated--;
    }
  }
  if (body.length > 5) console.log(`  … и ещё ${body.length - 5} строк`);

  if (loginClashes.length) {
    console.log(
      `\n  ⚠ ПРОПУЩЕНЫ строки, где логин занят сотрудником (${loginClashes.length}):`
    );
    loginClashes.forEach((c) => console.log(`      ${c}`));
    console.log(
      "      Решите вручную: либо смените логин менеджеру, либо клиенту в файле."
    );
  }
  if (emailClashes.length) {
    console.log(`\n  ⚠ конфликт почты (${emailClashes.length}):`);
    emailClashes.forEach((c) => console.log(`      ${c}`));
  }
  if (unknownWh.size) {
    console.log(`\n  ⚠ склады из файла, которых нет в базе: ${[...unknownWh].join(" | ")}`);
  }
  if (unknownMgr.size) {
    console.log(
      `\n  ⚠ менеджеры из файла, которых нет в базе: ${[...unknownMgr].join(" | ")}` +
        `\n    (сначала запустите с --managers, иначе клиенты останутся без менеджера)`
    );
  }
}

// ─── Итог ───────────────────────────────────────────────────────────────────
console.log("\n── ИТОГ ──");
if (doManagers) console.log(`  менеджеры: создано ${stats.mgrCreated}, обновлено ${stats.mgrUpdated}`);
if (clientsFile) console.log(`  клиенты:   создано ${stats.cliCreated}, обновлено ${stats.cliUpdated}`);
if (stats.skipped.length) {
  console.log(`  пропущено: ${stats.skipped.length}`);
  stats.skipped.slice(0, 10).forEach((s) => console.log(`    - ${s}`));
}
console.log(apply ? "\n✓ Готово." : "\nНичего не изменено. Повторите с флагом --yes.");
await prisma.$disconnect();
