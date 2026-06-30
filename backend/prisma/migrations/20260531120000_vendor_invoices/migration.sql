-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('customer', 'vendor');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "invoiceType" "InvoiceType" NOT NULL DEFAULT 'customer',
ADD COLUMN "tradingPurchaseId" TEXT,
ADD COLUMN "rawPurchaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tradingPurchaseId_key" ON "Invoice"("tradingPurchaseId");
CREATE UNIQUE INDEX "Invoice_rawPurchaseId_key" ON "Invoice"("rawPurchaseId");
CREATE INDEX "Invoice_invoiceType_idx" ON "Invoice"("invoiceType");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tradingPurchaseId_fkey" FOREIGN KEY ("tradingPurchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rawPurchaseId_fkey" FOREIGN KEY ("rawPurchaseId") REFERENCES "RawPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
