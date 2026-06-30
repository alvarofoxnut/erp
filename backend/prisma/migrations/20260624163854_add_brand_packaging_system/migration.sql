/*
  Warnings:

  - Made the column `batchNumber` on table `FinishedProduction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `remainingQuantity` on table `FinishedProduction` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ManufacturingSaleType" AS ENUM ('loose', 'branded');

-- AlterEnum
ALTER TYPE "StockCategory" ADD VALUE 'branded_goods';

-- AlterTable
ALTER TABLE "FinishedProduction" ALTER COLUMN "batchNumber" SET NOT NULL,
ALTER COLUMN "remainingQuantity" SET NOT NULL;

-- AlterTable
ALTER TABLE "ManufacturingSale" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "packetCount" DOUBLE PRECISION,
ADD COLUMN     "saleType" "ManufacturingSaleType" NOT NULL DEFAULT 'loose',
ALTER COLUMN "quantity" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "StockLedger" ADD COLUMN     "brandId" TEXT;

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packetSizeGrams" DOUBLE PRECISION NOT NULL,
    "proportion6No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proportion5No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proportion4_5No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proportion4No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingTransaction" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "quantityPackedKg" DOUBLE PRECISION NOT NULL,
    "packetsCreated" DOUBLE PRECISION NOT NULL,
    "consumed6No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumed5No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumed4_5No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumed4No" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerPacket" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_name_idx" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Brand_isActive_idx" ON "Brand"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_packetSizeGrams_key" ON "Brand"("name", "packetSizeGrams");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingTransaction_serialNumber_key" ON "PackagingTransaction"("serialNumber");

-- CreateIndex
CREATE INDEX "PackagingTransaction_date_idx" ON "PackagingTransaction"("date");

-- CreateIndex
CREATE INDEX "PackagingTransaction_lotNumber_date_idx" ON "PackagingTransaction"("lotNumber", "date");

-- CreateIndex
CREATE INDEX "PackagingTransaction_brandId_date_idx" ON "PackagingTransaction"("brandId", "date");

-- CreateIndex
CREATE INDEX "ManufacturingSale_saleType_idx" ON "ManufacturingSale"("saleType");

-- CreateIndex
CREATE INDEX "ManufacturingSale_brandId_idx" ON "ManufacturingSale"("brandId");

-- CreateIndex
CREATE INDEX "StockLedger_category_brandId_date_idx" ON "StockLedger"("category", "brandId", "date");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingTransaction" ADD CONSTRAINT "PackagingTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingTransaction" ADD CONSTRAINT "PackagingTransaction_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSale" ADD CONSTRAINT "ManufacturingSale_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
