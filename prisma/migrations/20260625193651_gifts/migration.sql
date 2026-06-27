-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GiftRule" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRuleTrigger" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "GiftRuleTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRuleGift" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "GiftRuleGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftRule_active_idx" ON "GiftRule"("active");

-- CreateIndex
CREATE INDEX "GiftRuleTrigger_productId_idx" ON "GiftRuleTrigger"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRuleTrigger_ruleId_productId_key" ON "GiftRuleTrigger"("ruleId", "productId");

-- CreateIndex
CREATE INDEX "GiftRuleGift_productId_idx" ON "GiftRuleGift"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRuleGift_ruleId_productId_key" ON "GiftRuleGift"("ruleId", "productId");

-- AddForeignKey
ALTER TABLE "GiftRuleTrigger" ADD CONSTRAINT "GiftRuleTrigger_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GiftRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRuleTrigger" ADD CONSTRAINT "GiftRuleTrigger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRuleGift" ADD CONSTRAINT "GiftRuleGift_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GiftRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRuleGift" ADD CONSTRAINT "GiftRuleGift_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
