import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create payments table
 *
 * Tracks Paystack payment transactions for tip processing.
 * Each payment has a unique reference used for Paystack checkout and verification.
 * Stores paystack_response for audit trail of API/webhook payloads.
 */
export class CreatePaymentsTable1730000000003 implements MigrationInterface {
  name = 'CreatePaymentsTable1730000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" "public"."entity_status" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tip_id" uuid,
        "reference" character varying NOT NULL,
        "amount" numeric(15,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "payment_status" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "paystack_response" jsonb,
        "paid_at" TIMESTAMP,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payments_reference"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_payment_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_tip_id"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
