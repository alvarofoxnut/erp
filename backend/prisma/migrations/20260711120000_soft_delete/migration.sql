-- Soft delete columns for ERP transactional and master records

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "ManufacturingVendor" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ManufacturingVendor" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ManufacturingVendor" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "ManufacturingVendor" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "RawPurchase" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RawPurchase" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "RawPurchase" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "RawPurchase" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "MachineEntry" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MachineEntry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MachineEntry" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "MachineEntry" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "QualityProduction" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QualityProduction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "QualityProduction" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "QualityProduction" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "PackagingTransaction" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PackagingTransaction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "PackagingTransaction" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "PackagingTransaction" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "FinishedProduction" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinishedProduction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "FinishedProduction" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "FinishedProduction" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "ManufacturingSale" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ManufacturingSale" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ManufacturingSale" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "ManufacturingSale" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "ManufacturingDamage" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ManufacturingDamage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ManufacturingDamage" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "ManufacturingDamage" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "TradingDamage" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TradingDamage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "TradingDamage" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "TradingDamage" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

-- Migrate existing isActive=false master records to isDeleted
UPDATE "Item" SET "isDeleted" = true, "deletedAt" = NOW() WHERE "isActive" = false AND "isDeleted" = false;
UPDATE "Party" SET "isDeleted" = true, "deletedAt" = NOW() WHERE "isActive" = false AND "isDeleted" = false;
UPDATE "ManufacturingVendor" SET "isDeleted" = true, "deletedAt" = NOW() WHERE "isActive" = false AND "isDeleted" = false;
UPDATE "Brand" SET "isDeleted" = true, "deletedAt" = NOW() WHERE "isActive" = false AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "Item_isDeleted_idx" ON "Item"("isDeleted");
CREATE INDEX IF NOT EXISTS "Party_isDeleted_idx" ON "Party"("isDeleted");
CREATE INDEX IF NOT EXISTS "Purchase_isDeleted_idx" ON "Purchase"("isDeleted");
CREATE INDEX IF NOT EXISTS "Sale_isDeleted_idx" ON "Sale"("isDeleted");
CREATE INDEX IF NOT EXISTS "ManufacturingVendor_isDeleted_idx" ON "ManufacturingVendor"("isDeleted");
CREATE INDEX IF NOT EXISTS "RawPurchase_isDeleted_idx" ON "RawPurchase"("isDeleted");
CREATE INDEX IF NOT EXISTS "MachineEntry_isDeleted_idx" ON "MachineEntry"("isDeleted");
CREATE INDEX IF NOT EXISTS "QualityProduction_isDeleted_idx" ON "QualityProduction"("isDeleted");
CREATE INDEX IF NOT EXISTS "Brand_isDeleted_idx" ON "Brand"("isDeleted");
CREATE INDEX IF NOT EXISTS "PackagingTransaction_isDeleted_idx" ON "PackagingTransaction"("isDeleted");
CREATE INDEX IF NOT EXISTS "FinishedProduction_isDeleted_idx" ON "FinishedProduction"("isDeleted");
CREATE INDEX IF NOT EXISTS "ManufacturingSale_isDeleted_idx" ON "ManufacturingSale"("isDeleted");
CREATE INDEX IF NOT EXISTS "ManufacturingDamage_isDeleted_idx" ON "ManufacturingDamage"("isDeleted");
CREATE INDEX IF NOT EXISTS "TradingDamage_isDeleted_idx" ON "TradingDamage"("isDeleted");
CREATE INDEX IF NOT EXISTS "Expense_isDeleted_idx" ON "Expense"("isDeleted");
CREATE INDEX IF NOT EXISTS "Invoice_isDeleted_idx" ON "Invoice"("isDeleted");
