-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'damage';

-- CreateTable
CREATE TABLE "ManufacturingDamage" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "totalLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingDamageLine" (
    "id" TEXT NOT NULL,
    "damageId" TEXT NOT NULL,
    "inventoryType" "StockCategory" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "lossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ManufacturingDamageLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDamage" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "totalLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDamageLine" (
    "id" TEXT NOT NULL,
    "damageId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "lossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TradingDamageLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingDamage_serialNumber_key" ON "ManufacturingDamage"("serialNumber");

-- CreateIndex
CREATE INDEX "ManufacturingDamage_date_idx" ON "ManufacturingDamage"("date");

-- CreateIndex
CREATE INDEX "ManufacturingDamageLine_damageId_idx" ON "ManufacturingDamageLine"("damageId");

-- CreateIndex
CREATE INDEX "ManufacturingDamageLine_inventoryType_idx" ON "ManufacturingDamageLine"("inventoryType");

-- CreateIndex
CREATE UNIQUE INDEX "TradingDamage_serialNumber_key" ON "TradingDamage"("serialNumber");

-- CreateIndex
CREATE INDEX "TradingDamage_date_idx" ON "TradingDamage"("date");

-- CreateIndex
CREATE INDEX "TradingDamageLine_damageId_idx" ON "TradingDamageLine"("damageId");

-- CreateIndex
CREATE INDEX "TradingDamageLine_itemId_idx" ON "TradingDamageLine"("itemId");

-- AddForeignKey
ALTER TABLE "ManufacturingDamage" ADD CONSTRAINT "ManufacturingDamage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingDamageLine" ADD CONSTRAINT "ManufacturingDamageLine_damageId_fkey" FOREIGN KEY ("damageId") REFERENCES "ManufacturingDamage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingDamage" ADD CONSTRAINT "TradingDamage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingDamageLine" ADD CONSTRAINT "TradingDamageLine_damageId_fkey" FOREIGN KEY ("damageId") REFERENCES "TradingDamage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingDamageLine" ADD CONSTRAINT "TradingDamageLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
