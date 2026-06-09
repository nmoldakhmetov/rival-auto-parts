-- CreateEnum
CREATE TYPE "ProductBadge" AS ENUM ('NEW', 'HIT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "onecNumber" TEXT,
ADD COLUMN     "onecSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "badge" "ProductBadge",
ADD COLUMN     "fullNameNorm" TEXT,
ADD COLUMN     "oldPrice" DECIMAL(12,2),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "skuNorm" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastProduct" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "BroadcastProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastProduct_broadcastId_idx" ON "BroadcastProduct"("broadcastId");

-- CreateIndex
CREATE INDEX "BroadcastProduct_productId_idx" ON "BroadcastProduct"("productId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_userId_idx" ON "BroadcastRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_userId_key" ON "BroadcastRecipient"("broadcastId", "userId");

-- CreateIndex
CREATE INDEX "Product_pinned_idx" ON "Product"("pinned");

-- CreateIndex
CREATE INDEX "Product_skuNorm_idx" ON "Product"("skuNorm");

-- CreateIndex
CREATE INDEX "Product_fullNameNorm_idx" ON "Product"("fullNameNorm");

-- AddForeignKey
ALTER TABLE "BroadcastProduct" ADD CONSTRAINT "BroadcastProduct_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastProduct" ADD CONSTRAINT "BroadcastProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
