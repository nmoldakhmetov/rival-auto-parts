import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hash = (pw) => bcrypt.hashSync(pw, 10);

// Bootstrap accounts + warehouse access. Products/stock come from 1С sync
// (/api/sync). The two warehouses below match the real 1С warehouse names,
// so the demo client's access stays valid after a sync (upsert by name).
const WAREHOUSES = ["БК склад", "Car City склад"];
const CLIENT_ACCESS = ["БК склад", "Car City склад"];

async function main() {
  // 1) Warehouses (the real feed has more; these are the ones the demo
  //    client is granted access to).
  const wh = {};
  for (const name of WAREHOUSES) {
    wh[name] = await prisma.warehouse.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 2) Admin
  await prisma.user.upsert({
    where: { login: "admin" },
    update: {},
    create: {
      login: "admin",
      role: "ADMIN",
      fullName: "Администратор",
      passwordHash: hash("admin123"),
    },
  });

  // 3) Manager (phone is used for the WhatsApp hand-off)
  const manager = await prisma.user.upsert({
    where: { login: "manager" },
    update: { phone: "+7 900 123-45-67" },
    create: {
      login: "manager",
      role: "MANAGER",
      fullName: "Иван Менеджеров",
      email: "manager@rival.local",
      phone: "+7 900 123-45-67",
      passwordHash: hash("manager123"),
    },
  });

  // 3b) RA (как админ, без «Настроек») и бухгалтер — видят всех клиентов
  await prisma.user.upsert({
    where: { login: "ra" },
    update: { role: "RA" },
    create: {
      login: "ra",
      role: "RA",
      fullName: "Rival Auto",
      passwordHash: hash("ra123"),
    },
  });
  await prisma.user.upsert({
    where: { login: "accountant" },
    update: { role: "ACCOUNTANT" },
    create: {
      login: "accountant",
      role: "ACCOUNTANT",
      fullName: "Бухгалтер",
      passwordHash: hash("accountant123"),
    },
  });

  // 4) Client assigned to the manager
  const client = await prisma.user.upsert({
    where: { login: "client" },
    update: { managerId: manager.id },
    create: {
      login: "client",
      role: "CLIENT",
      fullName: "ООО «Автоальянс»",
      email: "client@rival.local",
      phone: "+7 900 765-43-21",
      address: "г. Москва, ул. Складская, д. 7",
      passwordHash: hash("client123"),
      managerId: manager.id,
    },
  });

  // 5) Warehouse access for the client
  await prisma.clientWarehouseAccess.deleteMany({ where: { userId: client.id } });
  await prisma.clientWarehouseAccess.createMany({
    data: CLIENT_ACCESS.map((n) => ({ userId: client.id, warehouseId: wh[n].id })),
    skipDuplicates: true,
  });

  console.log("✓ Seed complete (accounts + warehouse access).");
  console.log(
    "  users: admin/admin123, ra/ra123, accountant/accountant123, manager/manager123, client/client123"
  );
  console.log("  Запустите синхронизацию с 1С, чтобы наполнить каталог.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
