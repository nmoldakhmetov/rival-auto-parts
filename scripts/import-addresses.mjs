// Заполняет адреса клиентов из выгрузки customer_address*.xlsx.
//
//   node scripts/import-addresses.mjs "C:\путь\customer_address.xlsx"
//   node scripts/import-addresses.mjs "C:\путь\customer_address.xlsx" --yes
//
// По умолчанию только отчёт. Флаги:
//   --yes         применить изменения
//   --only-empty  трогать лишь тех, у кого адрес ещё не заполнен
//
// Ожидаемые колонки: Клиент | Страна | Область | Город | Адрес
//
// Клиент ищется по ФИО (логинов в выгрузке нет), поэтому неоднозначные случаи
// пропускаются и попадают в отчёт, а не «угадываются»:
//   • одно ФИО с разными адресами в самой выгрузке;
//   • одно ФИО у нескольких клиентов в базе;
//   • ФИО, которого в базе нет.
//
// Населённый пункт склеивается как «Страна, Область, Город» — тот же формат,
// что даёт выбор населённого пункта в админке. Повтор подряд убирается:
// «Казахстан, Казахстан, Астана» → «Казахстан, Астана».
import { readFileSync } from "node:fs";
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
const file = argv.find((a) => !a.startsWith("--"));
const apply = argv.includes("--yes");
const onlyEmpty = argv.includes("--only-empty");

if (!file) {
  console.error('Использование: node scripts/import-addresses.mjs "<файл.xlsx>" [--yes] [--only-empty]');
  process.exit(1);
}

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

// «Казахстан» + «Казахстан» + «Астана» → «Казахстан, Астана»
function buildCity(country, region, town) {
  const parts = [clean(country), clean(region), clean(town)].filter(Boolean);
  return parts.filter((v, i) => i === 0 || norm(v) !== norm(parts[i - 1])).join(", ");
}

const wb = XLSX.read(readFileSync(file), {});
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  blankrows: false,
});
const header = rows[0]?.map(clean) ?? [];
if (norm(header[0]) !== "клиент") {
  console.error(`✗ Ожидалась первая колонка «Клиент», получено «${header[0]}».`);
  console.error(`  Заголовки файла: ${header.join(" | ")}`);
  process.exit(1);
}
const body = rows.slice(1);

const prisma = new PrismaClient();
const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База:   ${host}`);
console.log(`Файл:   ${file.split(/[\\/]/).pop()} (${body.length} строк)`);
console.log(`Режим:  ${apply ? "ЗАПИСЬ" : "проверка (--yes для применения)"}${onlyEmpty ? ", только пустые адреса" : ""}\n`);

// ── 1. Группируем выгрузку по ФИО, ловим противоречия ───────────────────────
const byName = new Map();
for (const r of body) {
  const key = norm(r[0]);
  if (!key) continue;
  const rec = {
    fullName: clean(r[0]),
    city: buildCity(r[1], r[2], r[3]),
    address: clean(r[4]),
  };
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(rec);
}

const ambiguousInFile = [];
const resolved = new Map();
for (const [key, list] of byName) {
  const variants = new Set(list.map((r) => `${r.city}|${r.address}`));
  if (variants.size > 1) {
    ambiguousInFile.push({ fullName: list[0].fullName, count: variants.size, list });
    continue;
  }
  resolved.set(key, list[0]);
}

// ── 2. Сопоставляем с клиентами в базе ──────────────────────────────────────
const clients = await prisma.user.findMany({
  where: { role: "CLIENT" },
  select: { id: true, login: true, fullName: true, city: true, address: true },
});
const clientsByName = new Map();
for (const c of clients) {
  const key = norm(c.fullName);
  if (!clientsByName.has(key)) clientsByName.set(key, []);
  clientsByName.get(key).push(c);
}

const toUpdate = [];
const notFound = [];
const ambiguousInBase = [];
let unchanged = 0;
let skippedFilled = 0;

for (const [key, rec] of resolved) {
  const hits = clientsByName.get(key);
  if (!hits) {
    notFound.push(rec.fullName);
    continue;
  }
  if (hits.length > 1) {
    ambiguousInBase.push({ fullName: rec.fullName, logins: hits.map((h) => h.login) });
    continue;
  }
  const c = hits[0];
  if (onlyEmpty && (c.address ?? "").trim()) {
    skippedFilled++;
    continue;
  }
  if ((c.city ?? "") === rec.city && (c.address ?? "") === rec.address) {
    unchanged++;
    continue;
  }
  toUpdate.push({ client: c, next: rec });
}

// ── 3. Отчёт ────────────────────────────────────────────────────────────────
console.log("── ПРИМЕРЫ ИЗМЕНЕНИЙ ──");
toUpdate.slice(0, 5).forEach(({ client, next }) => {
  console.log(`  ${client.login.padEnd(14)} ${next.fullName}`);
  console.log(`     населённый пункт: ${client.city || "—"}  →  ${next.city}`);
  console.log(`     адрес:            ${client.address || "—"}  →  ${next.address}`);
});
if (toUpdate.length > 5) console.log(`  … и ещё ${toUpdate.length - 5}`);

if (ambiguousInFile.length) {
  console.log(`\n  ⚠ В выгрузке одно ФИО с РАЗНЫМИ адресами (${ambiguousInFile.length}) — пропускаю,`);
  console.log("    выберите нужный адрес вручную:");
  ambiguousInFile.slice(0, 8).forEach((a) => {
    console.log(`      «${a.fullName}» — ${a.count} вариантов:`);
    a.list.slice(0, 3).forEach((v) => console.log(`          ${v.city} / ${v.address}`));
  });
  if (ambiguousInFile.length > 8) console.log(`      … и ещё ${ambiguousInFile.length - 8}`);
}

if (ambiguousInBase.length) {
  console.log(`\n  ⚠ Одинаковое ФИО у нескольких клиентов в базе (${ambiguousInBase.length}) — пропускаю:`);
  ambiguousInBase.forEach((a) => console.log(`      «${a.fullName}» → логины: ${a.logins.join(", ")}`));
}

if (notFound.length) {
  console.log(`\n  ⚠ Нет такого клиента в базе (${notFound.length}):`);
  notFound.slice(0, 15).forEach((n) => console.log(`      «${n}»`));
  if (notFound.length > 15) console.log(`      … и ещё ${notFound.length - 15}`);
}

// ── 4. Запись ───────────────────────────────────────────────────────────────
if (apply && toUpdate.length) {
  let done = 0;
  for (const { client, next } of toUpdate) {
    await prisma.user.update({
      where: { id: client.id },
      data: { city: next.city || null, address: next.address || null },
    });
    done++;
    if (done % 200 === 0) console.log(`  … обновлено ${done}`);
  }
  console.log(`\n  обновлено записей: ${done}`);
}

console.log("\n── ИТОГ ──");
console.log(`  уникальных ФИО в файле:        ${byName.size}`);
console.log(`  ${apply ? "обновлено" : "будет обновлено"}:${" ".repeat(apply ? 21 : 15)}${toUpdate.length}`);
console.log(`  уже совпадает, не трогаем:     ${unchanged}`);
if (onlyEmpty) console.log(`  пропущено (адрес уже есть):    ${skippedFilled}`);
console.log(`  пропущено из-за противоречий:  ${ambiguousInFile.length + ambiguousInBase.length}`);
console.log(`  не найдено в базе:             ${notFound.length}`);
console.log(apply ? "\n✓ Готово." : "\nНичего не изменено. Повторите с флагом --yes.");
await prisma.$disconnect();
