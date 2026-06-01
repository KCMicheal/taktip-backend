import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create payments table
 *
 * Tracks payment transactions through configured payment providers.
 * Provider-agnostic — works with Paystack, Stripe, Flutterwave, etc.
 * Each payment has a unique reference for idempotency and reconciliation.
 */
export class CreatePaymentsTable1730000000003 implements MigrationInterface {
  name = 'CreatePaymentsTable1730000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tip_id" uuid,
        "reference" character varying NOT NULL,
        "provider" character varying NOT NULL DEFAULT 'paystack',
        "provider_reference" character varying,
        "amount" numeric(15,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "payment_status" integer NOT NULL DEFAULT 0,
        "failure_reason" text,
        "channel" character varying,
        "metadata" jsonb,
        "provider_response" jsonb,
        "paid_at" TIMESTAMP,
        "refunded_at" TIMESTAMP,
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_reference" UNIQUE ("reference")
      )
    `);

    // Performance indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_payments_tip_id" ON "payments" ("tip_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payments_payment_status" ON "payments" ("payment_status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payments_reference" ON "payments" ("reference")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payments_provider" ON "payments" ("provider")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payments_provider"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_reference"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_payment_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_tip_id"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
