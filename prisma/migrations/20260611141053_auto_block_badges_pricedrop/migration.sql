-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "newUntil" TIMESTAMP(3),
ADD COLUMN     "priceDropAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "debtSince" TIMESTAMP(3);
