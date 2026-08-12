-- Speeds up DISTINCT ON (lotNumber) balance lookups used by available-lots / WIP lots dropdowns
CREATE INDEX IF NOT EXISTS "StockLedger_category_lotNumber_createdAt_id_idx"
ON "StockLedger" ("category", "lotNumber", "createdAt" DESC, "id" DESC);
