import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create tips table
 *
 * Records tips given to staff members by customers.
 * Supports both guest (via QR/Paystack) and logged-in customer flows.
 * Tracks source (QR_CODE, CUSTOMER_APP, etc.) and status (COMPLETED, PENDING, etc.).
 */
export class CreateTipsTable1730000000002 implements MigrationInterface {
  name = 'CreateTipsTable1730000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tips" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" "public"."entity_status" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "transaction_id" uuid,
        "merchant_id" uuid NOT NULL,
        "staff_profile_id" uuid NOT NULL,
        "customer_profile_id" uuid,
        "amount" numeric(15,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "message" character varying,
        "rating" integer,
        "source" integer NOT NULL,
        "tip_status" integer NOT NULL DEFAULT 0,
        "qr_code_id" uuid,
        CONSTRAINT "PK_tips" PRIMARY KEY ("id")
      )
    `);

    // Performance indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_merchant_id" ON "tips" ("merchant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_staff_profile_id" ON "tips" ("staff_profile_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_customer_profile_id" ON "tips" ("customer_profile_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_tip_status" ON "tips" ("tip_status")
    `);
    // Index for staff earnings queries (staff + status)
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_staff_status" ON "tips" ("staff_profile_id", "tip_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tips_staff_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tips_tip_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tips_customer_profile_id"`);
    await queryRunner.query(`DROP INDEX "IDX_tips_staff_profile_id"`);
    await queryRunner.query(`DROP INDEX "IDX_tips_merchant_id"`);
    await queryRunner.query(`DROP TABLE "tips"`);
  }
}
