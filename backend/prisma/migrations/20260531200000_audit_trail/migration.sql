-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastLogout" TIMESTAMP(3);

-- AlterTable AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "recordType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "description" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "oldValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "newValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "AuditLog" ADD COLUMN "financialYear" TEXT;
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "updatedAt";

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_financialYear_idx" ON "AuditLog"("financialYear");
CREATE INDEX "AuditLog_recordType_idx" ON "AuditLog"("recordType");
CREATE INDEX "AuditLog_priority_idx" ON "AuditLog"("priority");

-- CreateTable UserSession
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "loginTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutTime" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionDuration" INTEGER,
    "browser" TEXT,
    "device" TEXT,
    "os" TEXT,
    "ipAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable DeletedRecord
CREATE TABLE "DeletedRecord" (
    "id" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "module" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordIdentifier" TEXT,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "DeletedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable InventoryAuditLog
CREATE TABLE "InventoryAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceModule" TEXT NOT NULL,
    "stockType" TEXT NOT NULL,
    "quantityBefore" DOUBLE PRECISION NOT NULL,
    "quantityChanged" DOUBLE PRECISION NOT NULL,
    "quantityAfter" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "ip" TEXT,

    CONSTRAINT "InventoryAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSession_userId_loginTime_idx" ON "UserSession"("userId", "loginTime");
CREATE INDEX "UserSession_isActive_lastActivityAt_idx" ON "UserSession"("isActive", "lastActivityAt");

CREATE INDEX "DeletedRecord_deletedAt_idx" ON "DeletedRecord"("deletedAt");
CREATE INDEX "DeletedRecord_module_recordType_idx" ON "DeletedRecord"("module", "recordType");
CREATE INDEX "DeletedRecord_recordId_idx" ON "DeletedRecord"("recordId");
CREATE INDEX "DeletedRecord_deletedById_idx" ON "DeletedRecord"("deletedById");

CREATE INDEX "InventoryAuditLog_userId_date_idx" ON "InventoryAuditLog"("userId", "date");
CREATE INDEX "InventoryAuditLog_sourceModule_stockType_idx" ON "InventoryAuditLog"("sourceModule", "stockType");
CREATE INDEX "InventoryAuditLog_date_idx" ON "InventoryAuditLog"("date");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeletedRecord" ADD CONSTRAINT "DeletedRecord_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
