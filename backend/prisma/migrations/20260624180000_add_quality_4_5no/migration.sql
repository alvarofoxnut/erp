-- AlterEnum
ALTER TYPE "StockCategory" ADD VALUE 'quality_4_5no';

-- AlterTable
ALTER TABLE "QualityProduction" ADD COLUMN "quantity4_5No" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QualityProduction" ADD COLUMN "rate4_5No" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FinishedProduction" ADD COLUMN "consumed4_5No" DOUBLE PRECISION NOT NULL DEFAULT 0;
