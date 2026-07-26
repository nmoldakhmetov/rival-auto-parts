import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Production bootstrap — runs on every deploy, so it must be idempotent and
// must never touch data that already exists.
//
// It only guarantees two things:
//   1) the two real 1С warehouses exist (products/stock come from /api/sync);
//   2) there is exactly one ADMIN account to log in with on a fresh database.
//
// No demo/sample users are created. The admin password is NEVER rewritten for
// an existing account: change it with `node scripts/set-password.mjs admin`.
const WAREHOUSES = ["БК склад", "Car City склад"];

async function main() {
  for (const name of WAREHOUSES) {
    await prisma.warehouse.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const existing = await prisma.user.findUnique({ where: { login: "admin" } });
  if (existing) {
    console.log("✓ Seed: администратор уже существует, пароль не изменялся.");
  } else {
    // First boot only. Prefer an explicit env secret; otherwise mint a random
    // one-time password so a fresh install is never left with a known default.
    const initial =
      process.env.ADMIN_INITIAL_PASSWORD || randomBytes(12).toString("base64url");
    await prisma.user.create({
      data: {
        login: "admin",
        role: "ADMIN",
        fullName: "Администратор",
        passwordHash: bcrypt.hashSync(initial, 10),
      },
    });
    console.log("✓ Seed: создан администратор (login: admin).");
    if (process.env.ADMIN_INITIAL_PASSWORD) {
      console.log("  Пароль взят из ADMIN_INITIAL_PASSWORD.");
    } else {
      console.log(`  Временный пароль: ${initial}`);
      console.log("  ⚠ Смените его: node scripts/set-password.mjs admin");
    }
  }

  console.log("  Запустите синхронизацию с 1С, чтобы наполнить каталог.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
