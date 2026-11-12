BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('FREE', 'OCCUPIED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('PAYMENT_TIMEOUT', 'ADMINISTRATOR');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'FREE',
    "mapX" DOUBLE PRECISION,
    "mapY" DOUBLE PRECISION,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSeries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weekdays" INTEGER[],
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "tariffId" UUID NOT NULL,
    "seriesId" UUID,
    "workspaceName" VARCHAR(100) NOT NULL,
    "tariffName" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentDeadline" TIMESTAMPTZ(3) NOT NULL,
    "cancellationReason" "CancellationReason",
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resourceType" VARCHAR(40) NOT NULL,
    "resourceId" UUID NOT NULL,
    "details" JSONB NOT NULL,
    "operationId" UUID,
    "requestHash" CHAR(64),
    "response" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "event" VARCHAR(80) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSeries_userId_idx" ON "BookingSeries"("userId");

-- CreateIndex
CREATE INDEX "Booking_workspaceId_startsAt_endsAt_idx" ON "Booking"("workspaceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Booking_userId_startsAt_idx" ON "Booking"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_status_paymentDeadline_idx" ON "Booking"("status", "paymentDeadline");

-- CreateIndex
CREATE INDEX "Booking_seriesId_idx" ON "Booking"("seriesId");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_actorId_operationId_key" ON "AuditLog"("actorId", "operationId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BookingSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL-enforced catalog, interval, history and audit invariants.
CREATE UNIQUE INDEX "Workspace_active_name_key" ON "Workspace" (lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Tariff_active_name_key" ON "Tariff" (lower("name")) WHERE "deletedAt" IS NULL;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_fields_valid" CHECK (
  length(btrim("name")) > 0 AND length(btrim("type")) > 0 AND length(btrim("location")) > 0
  AND (("mapX" IS NULL AND "mapY" IS NULL) OR
       ("mapX" IS NOT NULL AND "mapY" IS NOT NULL AND "mapX" BETWEEN 0 AND 1 AND "mapY" BETWEEN 0 AND 1))
);
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_price_positive" CHECK ("price" > 0 AND length(btrim("name")) > 0);
ALTER TABLE "BookingSeries" ALTER COLUMN "weekdays" SET NOT NULL;
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_period_valid" CHECK (
  "fromDate" <= "toDate" AND cardinality("weekdays") > 0 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]
);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_interval_valid" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_price_positive" CHECK ("amount" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_deadline_valid" CHECK ("paymentDeadline" > "createdAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancellation_reason_valid" CHECK (
  ("status" = 'CANCELLED' AND "cancellationReason" IS NOT NULL)
  OR ("status" <> 'CANCELLED' AND "cancellationReason" IS NULL)
);
-- Half-open ranges permit adjacent reservations. NOW() cannot appear in this predicate:
-- expired pending rows are cancelled under the workspace lock before a new insert.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_active_overlap"
  EXCLUDE USING gist (
    "workspaceId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED'));

CREATE FUNCTION "guard_booking_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."amount", NEW."tariffId", NEW."tariffName", NEW."paymentDeadline", NEW."createdAt")
     IS DISTINCT FROM ROW(OLD."amount", OLD."tariffId", OLD."tariffName", OLD."paymentDeadline", OLD."createdAt") THEN
    RAISE EXCEPTION 'Booking price snapshot and original payment deadline are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('COMPLETED', 'CANCELLED') AND NEW."status" <> OLD."status" THEN
    RAISE EXCEPTION 'Terminal booking status cannot be reopened' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'PENDING_PAYMENT' AND NEW."status" NOT IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid pending booking transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'CONFIRMED' AND NEW."status" NOT IN ('CONFIRMED', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid confirmed booking transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Booking_history_guard" BEFORE UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION "guard_booking_history"();

CREATE FUNCTION "reject_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "reject_audit_mutation"();
CREATE TRIGGER "AuditLog_no_truncate" BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_mutation"();

COMMIT;
