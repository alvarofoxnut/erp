-- Damage line snapshot fields for lot/batch traceability and cost immutability

ALTER TABLE "ManufacturingDamageLine" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "ManufacturingDamageLine" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ManufacturingDamageLine" ADD COLUMN "batchNumber" TEXT;
ALTER TABLE "ManufacturingDamageLine" ADD COLUMN "costPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ManufacturingDamageLine" ADD COLUMN "reason" TEXT;

ALTER TABLE "TradingDamageLine" ADD COLUMN "costPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TradingDamageLine" ADD COLUMN "reason" TEXT;

ALTER TABLE "ManufacturingDamageLine" ADD CONSTRAINT "ManufacturingDamageLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "FinishedProduction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ManufacturingDamageLine_batchId_idx" ON "ManufacturingDamageLine"("batchId");
CREATE INDEX "ManufacturingDamageLine_lotNumber_idx" ON "ManufacturingDamageLine"("lotNumber");
