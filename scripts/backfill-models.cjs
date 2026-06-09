// One-off backfill: derive Product.model / modelNorm from the existing
// fullName + brand using the same heuristics as lib/onec.ts. Run once after
// adding the model column so the "make → models" filter works without a full
// 1С re-sync.  Usage:  node scripts/backfill-models.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── copied from lib/onec.ts (keep in sync) ──────────────────────────────
const SEARCH_SEP = /[\s\-_./()[\]]+/g;
function normSearch(s) {
  if (!s) return null;
  const n = s.toLowerCase().replace(SEARCH_SEP, "");
  return n.length ? n : null;
}

const CAR_MAKES = [
  ["Toyota", ["Toyota", "Тойота"]],
  ["Lexus", ["Lexus", "Лексус"]],
  ["Nissan", ["Nissan", "Ниссан"]],
  ["Infiniti", ["Infiniti", "Инфинити"]],
  ["Honda", ["Honda", "Хонда"]],
  ["Mazda", ["Mazda", "Мазда"]],
  ["Mitsubishi", ["Mitsubishi", "Митсубиси", "Мицубиси"]],
  ["Subaru", ["Subaru", "Субару"]],
  ["Suzuki", ["Suzuki", "Сузуки"]],
  ["Isuzu", ["Isuzu", "Исузу"]],
  ["Hyundai", ["Hyundai", "Хендай", "Хундай", "Хёндэ"]],
  ["Kia", ["Kia", "Киа", "КИА"]],
  ["Genesis", ["Genesis", "Дженезис"]],
  ["SsangYong", ["SsangYong", "Санг Йонг", "Сан Йонг"]],
  ["Daewoo", ["Daewoo", "Дэу", "Дэо"]],
  ["Chevrolet", ["Chevrolet", "Шевроле"]],
  ["Cadillac", ["Cadillac", "Кадиллак"]],
  ["GMC", ["GMC"]],
  ["Ford", ["Ford", "Форд"]],
  ["Dodge", ["Dodge", "Додж"]],
  ["Jeep", ["Jeep", "Джип"]],
  ["Chrysler", ["Chrysler", "Крайслер"]],
  ["BMW", ["BMW", "БМВ"]],
  ["Mercedes-Benz", ["Mercedes-Benz", "Mercedes", "Мерседес", "Бенц"]],
  ["Audi", ["Audi", "Ауди"]],
  ["Volkswagen", ["Volkswagen", "VW", "Фольксваген"]],
  ["Porsche", ["Porsche", "Порше"]],
  ["Opel", ["Opel", "Опель"]],
  ["Skoda", ["Skoda", "Škoda", "Шкода"]],
  ["Seat", ["Seat", "Сеат"]],
  ["Renault", ["Renault", "Рено"]],
  ["Peugeot", ["Peugeot", "Пежо"]],
  ["Citroen", ["Citroen", "Citroën", "Ситроен"]],
  ["Fiat", ["Fiat", "Фиат"]],
  ["Volvo", ["Volvo", "Вольво"]],
  ["Land Rover", ["Land Rover", "Range Rover", "Ленд Ровер"]],
  ["Jaguar", ["Jaguar", "Ягуар"]],
  ["Mini", ["Mini Cooper", "MINI"]],
  ["BYD", ["BYD"]],
  ["Chery", ["Chery", "Чери"]],
  ["Geely", ["Geely", "Джили"]],
  ["Haval", ["Haval", "Хавал"]],
  ["Great Wall", ["Great Wall", "Грейт Вол"]],
  ["Changan", ["Changan", "Чанган"]],
  ["JAC", ["JAC"]],
  ["Exeed", ["Exeed", "Эксид"]],
  ["Tank", ["Tank"]],
  ["Lada", ["Lada", "ВАЗ", "Лада", "VAZ"]],
  ["GAZ", ["ГАЗ", "GAZ"]],
  ["UAZ", ["УАЗ", "UAZ"]],
  ["Datsun", ["Datsun", "Датсун"]],
  ["MG", ["MG"]],
  ["Foton", ["Foton", "Фотон"]],
  ["Hino", ["Hino", "Хино"]],
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const MAKE_MATCHERS = CAR_MAKES.flatMap(([canonical, aliases]) =>
  aliases.map((a) => ({
    make: canonical,
    re: new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(a)}(?![\\p{L}\\p{N}])`,
      "iu"
    ),
  }))
);

const MODEL_STOP = /[,;:.()[\]/«»"]|\s\d{4}|\s(?:для|на|с|по|от|до|год|г\.)\b/iu;

function detectModel(fullName, make) {
  if (!fullName || !make) return null;
  let end = -1;
  let pos = Infinity;
  for (const m of MAKE_MATCHERS) {
    if (m.make !== make) continue;
    const mm = m.re.exec(fullName);
    if (mm && mm.index < pos) {
      pos = mm.index;
      end = mm.index + mm[0].length;
    }
  }
  if (end < 0) return null;
  let rest = fullName.slice(end);
  const stop = rest.search(MODEL_STOP);
  if (stop > 0) rest = rest.slice(0, stop);
  const tokens = rest
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => t.replace(/[^\p{L}\p{N}-]+/gu, ""))
    .filter((t) => t.length > 0);
  const model = tokens.join(" ").trim().slice(0, 40);
  return model.length >= 2 ? model : null;
}

// ─── run ──────────────────────────────────────────────────────────────────
async function main() {
  const products = await prisma.product.findMany({
    where: { brand: { not: null }, fullName: { not: null } },
    select: { id: true, fullName: true, brand: true },
  });
  console.log(`Кандидатов: ${products.length}`);

  let updated = 0;
  const CHUNK = 200;
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((p) => {
        const model = detectModel(p.fullName, p.brand);
        if (!model) return Promise.resolve();
        updated++;
        return prisma.product.update({
          where: { id: p.id },
          data: { model, modelNorm: normSearch(model) },
        });
      })
    );
    if (i % 1000 === 0) process.stdout.write(`.${i}`);
  }
  console.log(`\nГотово. Проставлена модель у ${updated} товаров.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
