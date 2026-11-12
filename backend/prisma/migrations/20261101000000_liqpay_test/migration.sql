-- Enum additions commit before their values are used in constraints/functions.
ALTER TYPE "PaymentProvider" ADD VALUE 'LIQPAY_TEST';
ALTER TYPE "PaymentStatus" ADD VALUE 'REQUIRES_REVIEW' BEFORE 'FAILED';

BEGIN;
ALTER TABLE "Payment"
  ADD COLUMN "providerPaymentId" VARCHAR(100),
  ADD COLUMN "checkoutPublicKey" VARCHAR(100),
  ADD COLUMN "checkoutServerUrl" VARCHAR(510),
  ADD COLUMN "checkoutResultUrl" VARCHAR(510);
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_one_pending_liqpay" ON "Payment"("bookingId") WHERE "provider" = 'LIQPAY_TEST' AND "status" = 'PENDING';
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_test_checkout_valid" CHECK (
  ("provider" = 'MOCK' AND "checkoutPublicKey" IS NULL AND "checkoutServerUrl" IS NULL AND "checkoutResultUrl" IS NULL AND "providerPaymentId" IS NULL)
  OR ("provider" = 'LIQPAY_TEST' AND "checkoutPublicKey" IS NOT NULL AND "checkoutServerUrl" IS NOT NULL AND left("checkoutPublicKey", 8) = 'sandbox_' AND "checkoutServerUrl" LIKE 'https://%')
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_review_provider_valid" CHECK ("status" <> 'REQUIRES_REVIEW' OR "provider" = 'LIQPAY_TEST');

CREATE TYPE "CallbackDisposition" AS ENUM ('PENDING', 'APPLIED', 'IGNORED', 'REQUIRES_REVIEW');
CREATE TABLE "PaymentCallback" (
  "id" UUID NOT NULL PRIMARY KEY,
  "paymentId" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payloadHash" CHAR(64) NOT NULL,
  "providerStatus" VARCHAR(80) NOT NULL,
  "providerPaymentId" VARCHAR(100) NOT NULL,
  "disposition" "CallbackDisposition" NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentCallback_paymentId_payloadHash_key" UNIQUE ("paymentId", "payloadHash")
);
CREATE INDEX "PaymentCallback_paymentId_receivedAt_idx" ON "PaymentCallback"("paymentId", "receivedAt");
CREATE TRIGGER "PaymentCallback_append_only" BEFORE UPDATE OR DELETE ON "PaymentCallback" FOR EACH ROW EXECUTE FUNCTION "reject_audit_mutation"();
CREATE TRIGGER "PaymentCallback_no_truncate" BEFORE TRUNCATE ON "PaymentCallback" FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_mutation"();

CREATE OR REPLACE FUNCTION "guard_payment_history"() RETURNS trigger LANGUAGE plpgsql AS $$
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
       OR ROW(NEW.id, NEW."bookingId", NEW."tariffId", NEW."userId", NEW.amount, NEW.currency, NEW.provider, NEW."idempotencyKey", NEW."requestHash", NEW."createdAt", NEW."checkoutPublicKey", NEW."checkoutServerUrl", NEW."checkoutResultUrl")
          IS DISTINCT FROM ROW(OLD.id, OLD."bookingId", OLD."tariffId", OLD."userId", OLD.amount, OLD.currency, OLD.provider, OLD."idempotencyKey", OLD."requestHash", OLD."createdAt", OLD."checkoutPublicKey", OLD."checkoutServerUrl", OLD."checkoutResultUrl")
       OR (OLD."providerPaymentId" IS NOT NULL AND NEW."providerPaymentId" IS DISTINCT FROM OLD."providerPaymentId")
       OR (NEW.status = 'PENDING' AND NEW.provider <> 'LIQPAY_TEST') THEN
      RAISE EXCEPTION 'Payment records and completed results are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'SUCCEEDED' THEN
      SELECT * INTO b FROM "Booking" WHERE id = NEW."bookingId" FOR UPDATE;
      IF b.status <> 'PENDING_PAYMENT' OR b."paymentDeadline" <= clock_timestamp() OR b."endsAt" <= clock_timestamp() THEN
        RAISE EXCEPTION 'Successful payment requires a currently payable booking' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
