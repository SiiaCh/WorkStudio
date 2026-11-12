CREATE TYPE "BillingUnit" AS ENUM ('HOUR', 'DAY', 'WEEK');

ALTER TABLE "Tariff"
ADD COLUMN "unit" "BillingUnit" NOT NULL DEFAULT 'HOUR';
