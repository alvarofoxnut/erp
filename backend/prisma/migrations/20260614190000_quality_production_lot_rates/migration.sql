-- QualityProduction: lot-scoped WIP output and per-grade rates
ALTER TABLE "QualityProduction" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "QualityProduction" ADD COLUMN "rate6No" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QualityProduction" ADD COLUMN "rate5No" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QualityProduction" ADD COLUMN "rate4No" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QualityProduction" ADD COLUMN "rateOthers" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "QualityProduction_lotNumber_date_idx" ON "QualityProduction"("lotNumber", "date");

-- FinishedProduction: lot linkage and finished goods costing
ALTER TABLE "FinishedProduction" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "FinishedProduction" ADD COLUMN "finishedRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "FinishedProduction" ADD COLUMN "finishedValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "FinishedProduction_lotNumber_date_idx" ON "FinishedProduction"("lotNumber", "date");
