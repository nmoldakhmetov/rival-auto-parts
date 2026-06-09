-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'CLIENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'SENT', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientWarehouseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientWarehouseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "comment" TEXT,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX "Stock_warehouseId_idx" ON "Stock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_productId_warehouseId_key" ON "Stock"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "ClientWarehouseAccess_warehouseId_idx" ON "ClientWarehouseAccess"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientWarehouseAccess_userId_warehouseId_key" ON "ClientWarehouseAccess"("userId", "warehouseId");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "SearchLog_userId_idx" ON "SearchLog"("userId");

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWarehouseAccess" ADD CONSTRAINT "ClientWarehouseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWarehouseAccess" ADD CONSTRAINT "ClientWarehouseAccess_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
