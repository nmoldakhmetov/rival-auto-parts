-- Trigram extension powers GIN indexes over LIKE %q% catalog search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Product_sku_trgm" ON "Product" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_name_trgm" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_fullName_trgm" ON "Product" USING GIN ("fullName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_skuNorm_trgm" ON "Product" USING GIN ("skuNorm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_fullNameNorm_trgm" ON "Product" USING GIN ("fullNameNorm" gin_trgm_ops);
