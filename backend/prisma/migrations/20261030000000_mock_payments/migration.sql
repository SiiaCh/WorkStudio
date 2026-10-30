BEGIN;
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK');
CREATE TABLE "Payment" (
  "id" UUID NOT NULL PRIMARY KEY,
  "bookingId" UUID NOT NULL REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tariffId" UUID NOT NULL REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" CHAR(3) NOT NULL DEFAULT 'UAH' CHECK ("currency" = 'UAH'),
  "provider" "PaymentProvider" NOT NULL,
  "providerReference" UUID UNIQUE,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" UUID NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Payment_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT "Payment_completion_valid" CHECK (
    ("status" = 'PENDING' AND "completedAt" IS NULL AND "providerReference" IS NULL)
    OR ("status" <> 'PENDING' AND "completedAt" IS NOT NULL AND "providerReference" IS NOT NULL)
  )
);
CREATE INDEX "Payment_bookingId_createdAt_idx" ON "Payment"("bookingId", "createdAt");
CREATE INDEX "Payment_tariffId_idx" ON "Payment"("tariffId");
CREATE UNIQUE INDEX "Payment_one_success_per_booking" ON "Payment"("bookingId") WHERE "status" = 'SUCCEEDED';

CREATE FUNCTION "guard_payment_history"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "Booking"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO b FROM "Booking" WHERE id = NEW."bookingId" FOR UPDATE;
    IF NOT FOUND OR b."userId" <> NEW."userId" OR b."tariffId" <> NEW."tariffId"
       OR b."amount" <> NEW."amount" OR b.status <> 'PENDING_PAYMENT'
       OR b."paymentDeadline" <= clock_timestamp() OR b."endsAt" <= clock_timestamp()
       OR NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Payment must reference an eligible booking and its saved price' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.status <> 'PENDING'
       OR ROW(NEW.id, NEW."bookingId", NEW."tariffId", NEW."userId", NEW.amount, NEW.currency, NEW.provider, NEW."idempotencyKey", NEW."requestHash", NEW."createdAt")
          IS DISTINCT FROM ROW(OLD.id, OLD."bookingId", OLD."tariffId", OLD."userId", OLD.amount, OLD.currency, OLD.provider, OLD."idempotencyKey", OLD."requestHash", OLD."createdAt")
       OR NEW.status NOT IN ('SUCCEEDED', 'FAILED') THEN
      RAISE EXCEPTION 'Payment records and completed results are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_history_guard" BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "guard_payment_history"();
CREATE TRIGGER "Payment_no_delete" BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "reject_audit_mutation"();
CREATE TRIGGER "Payment_no_truncate" BEFORE TRUNCATE ON "Payment" FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_mutation"();

CREATE FUNCTION "guard_booking_confirmation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PENDING_PAYMENT' AND NEW.status = 'CONFIRMED' THEN
    IF OLD."paymentDeadline" <= clock_timestamp() OR OLD."endsAt" <= clock_timestamp()
       OR NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = OLD.id AND p.status = 'SUCCEEDED') THEN
      RAISE EXCEPTION 'Confirmation requires a successful payment before the deadline' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Booking_payment_guard" BEFORE UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION "guard_booking_confirmation"();
COMMIT;
