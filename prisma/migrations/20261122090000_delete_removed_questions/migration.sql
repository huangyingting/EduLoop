-- Removed questions are now deleted on import, so retirement bookkeeping goes.
-- Columns are dropped in place instead of rebuilding the tables.
ALTER TABLE "CatalogRelease" DROP COLUMN "retired";
ALTER TABLE "CatalogRelease" DROP COLUMN "revived";
ALTER TABLE "CatalogRelease" DROP COLUMN "superseded";
ALTER TABLE "CatalogRelease" ADD COLUMN "deleted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Question" DROP COLUMN "retiredAt";
ALTER TABLE "Question" DROP COLUMN "supersededById";
