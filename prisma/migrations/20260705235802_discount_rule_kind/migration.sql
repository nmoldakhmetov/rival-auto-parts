-- CreateEnum
CREATE TYPE "RuleKind" AS ENUM ('DISCOUNT', 'MARKUP');

-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN     "kind" "RuleKind" NOT NULL DEFAULT 'DISCOUNT';
