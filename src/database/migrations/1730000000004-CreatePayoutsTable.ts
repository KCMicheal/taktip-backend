import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create payouts table
 *
 * Records staff payout requests and their lifecycle.
 * Payout flow: PENDING → APPROVED (enqueued to BullMQ) → COMPLETED/FAILED
 * Rejection goes: PENDING → REJECTED (reverses wallet balances)
 * Each payout has a unique reference for idempotency.
 */
export class CreatePayoutsTable1730000000004 implements MigrationInterface {
  name = 'CreatePayoutsTable1730000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payouts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" "public"."entity_status" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "staff_profile_id" uuid NOT NULL,
        "amount" numeric(15,2) NOT NULL,
        "fee" numeric(15,2) NOT NULL DEFAULT 0,
        "net_amount" numeric(15,2) NOT NULL,
        "bank_account" jsonb NOT NULL,
        "payout_status" integer NOT NULL DEFAULT 0,
        "reference" character varying NOT NULL,
        "admin_id" uuid,
        "processed_at" TIMESTAMP,
        "notes" character varying,
        CONSTRAINT "PK_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payouts_reference" UNIQUE ("reference")
      )
    `);

    // Performance indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_payouts_staff_profile_id" ON "payouts" ("staff_profile_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payouts_payout_status" ON "payouts" ("payout_status")
    `);
    // Index for admin queries (status-based filtering)
    await queryRunner.query(`
      CREATE INDEX "IDX_payouts_admin_status" ON "payouts" ("payout_status", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payouts_admin_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payouts_payout_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payouts_staff_profile_id"`);
    await queryRunner.query(`DROP TABLE "payouts"`);
  }
}
