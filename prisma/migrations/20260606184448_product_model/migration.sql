-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "model" TEXT,
ADD COLUMN     "modelNorm" TEXT;

-- CreateIndex
CREATE INDEX "Product_brand_model_idx" ON "Product"("brand", "model");
