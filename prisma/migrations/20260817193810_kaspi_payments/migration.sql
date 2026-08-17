-- CreateEnum
CREATE TYPE "KaspiPaymentStatus" AS ENUM ('QrTokenCreated', 'Wait', 'Processed', 'Error');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'KASPI';

-- CreateTable
CREATE TABLE "KaspiPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "kaspiPaymentId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "KaspiPaymentStatus" NOT NULL DEFAULT 'QrTokenCreated',
    "qrToken" TEXT,
    "paymentLink" TEXT,
    "expiresAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "productType" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KaspiPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KaspiPayment_orderId_idx" ON "KaspiPayment"("orderId");

-- CreateIndex
CREATE INDEX "KaspiPayment_kaspiPaymentId_idx" ON "KaspiPayment"("kaspiPaymentId");

-- AddForeignKey
ALTER TABLE "KaspiPayment" ADD CONSTRAINT "KaspiPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaspiPayment" ADD CONSTRAINT "KaspiPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
