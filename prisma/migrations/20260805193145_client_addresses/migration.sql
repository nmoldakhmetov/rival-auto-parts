-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryAddress" TEXT;

-- CreateTable
CREATE TABLE "ClientAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "city" TEXT,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientAddress_userId_idx" ON "ClientAddress"("userId");

-- AddForeignKey
ALTER TABLE "ClientAddress" ADD CONSTRAINT "ClientAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос уже заполненных адресов из карточек клиентов: на проде адреса
-- импортированы у сотен клиентов, и без этого списки оказались бы пустыми,
-- а в корзине стало бы не из чего выбирать. Адрес карточки становится
-- первым и основным; сама колонка User.address остаётся как была.
INSERT INTO "ClientAddress" ("id", "userId", "label", "city", "address", "isDefault", "createdAt", "updatedAt")
SELECT
    -- Не gen_random_uuid(): она есть не во всех сборках PostgreSQL, а md5()
    -- доступен везде и для id-строки этого достаточно.
    md5(random()::text || clock_timestamp()::text || u."id"),
    u."id",
    NULL,
    NULLIF(TRIM(COALESCE(u."city", '')), ''),
    TRIM(u."address"),
    TRUE,
    NOW(),
    NOW()
FROM "User" u
WHERE u."role" = 'CLIENT'
  AND u."address" IS NOT NULL
  AND TRIM(u."address") <> '';
