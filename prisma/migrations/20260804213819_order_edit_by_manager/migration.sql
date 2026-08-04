-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "editNote" TEXT,
ADD COLUMN     "editSeenAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "qtyOriginal" INTEGER;
