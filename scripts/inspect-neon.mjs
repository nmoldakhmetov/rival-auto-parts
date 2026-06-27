import fs from "node:fs";

// Load the pulled production env (DATABASE_URL etc.) without printing secrets.
const raw = fs.readFileSync(".env.production.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const out = {};

async function safe(key, fn) {
  try {
    out[key] = await fn();
  } catch (e) {
    out[key] = "ERR: " + (e instanceof Error ? e.message.slice(0, 120) : String(e));
  }
}

await safe("products", () => prisma.product.count());
await safe("warehouses", () => prisma.warehouse.count());
await safe("orders", () => prisma.order.count());
await safe("users", () =>
  prisma.user
    .findMany({ select: { login: true, role: true } })
    .then((u) => u.map((x) => `${x.login}:${x.role}`))
);
await safe("giftRules_table", () => prisma.giftRule.count());
await safe("migrations", () =>
  prisma
    .$queryRawUnsafe(
      'select migration_name from "_prisma_migrations" order by finished_at'
    )
    .then((r) => r.map((x) => x.migration_name))
);

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
