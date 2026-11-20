-- Removed questions are now deleted on import, so retirement bookkeeping goes.
-- AlterTable
ALTER TABLE "CatalogRelease" DROP COLUMN "retired",
DROP COLUMN "revived",
DROP COLUMN "superseded",
ADD COLUMN     "deleted" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "retiredAt",
DROP COLUMN "supersededById";

