-- FG batch FIFO costing: batch fields, sale allocations, ledger batchId

-- FinishedProduction: batch tracking
ALTER TABLE "FinishedProduction" ADD COLUMN "batchNumber" TEXT;
ALTER TABLE "FinishedProduction" ADD COLUMN "remainingQuantity" DOUBLE PRECISION;

-- ManufacturingSale: COGS
ALTER TABLE "ManufacturingSale" ADD COLUMN "costOfGoodsSold" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- StockLedger: batch reference for FG movements
ALTER TABLE "StockLedger" ADD COLUMN "batchId" TEXT;

-- ManufacturingSaleAllocation
CREATE TABLE "ManufacturingSaleAllocation" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costPerKg" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManufacturingSaleAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManufacturingSaleAllocation_saleId_idx" ON "ManufacturingSaleAllocation"("saleId");
CREATE INDEX "ManufacturingSaleAllocation_batchId_idx" ON "ManufacturingSaleAllocation"("batchId");

ALTER TABLE "ManufacturingSaleAllocation" ADD CONSTRAINT "ManufacturingSaleAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ManufacturingSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSaleAllocation" ADD CONSTRAINT "ManufacturingSaleAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinishedProduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinishedProduction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockLedger_batchId_date_idx" ON "StockLedger"("batchId", "date");
CREATE INDEX "FinishedProduction_remainingQuantity_idx" ON "FinishedProduction"("remainingQuantity");
