-- CreateEnum
CREATE TYPE "DiscountTarget" AS ENUM ('ALL', 'PRODUCT', 'CATEGORY', 'BRAND');

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "percent" INTEGER NOT NULL,
    "userId" TEXT,
    "target" "DiscountTarget" NOT NULL DEFAULT 'ALL',
    "category" TEXT,
    "brand" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRuleProduct" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountRule_userId_idx" ON "DiscountRule"("userId");

-- CreateIndex
CREATE INDEX "DiscountRule_target_idx" ON "DiscountRule"("target");

-- CreateIndex
CREATE INDEX "DiscountRule_active_idx" ON "DiscountRule"("active");

-- CreateIndex
CREATE INDEX "DiscountRuleProduct_productId_idx" ON "DiscountRuleProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRuleProduct_ruleId_productId_key" ON "DiscountRuleProduct"("ruleId", "productId");

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleProduct" ADD CONSTRAINT "DiscountRuleProduct_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleProduct" ADD CONSTRAINT "DiscountRuleProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
