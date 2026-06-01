import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create qr_codes table
 *
 * Stores QR codes generated for merchants/staff to receive tips.
 * Each QR code has a unique short_code for URL-safe resolution.
 */
export class CreateQrCodesTable1730000000001 implements MigrationInterface {
  name = 'CreateQrCodesTable1730000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "qr_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "merchant_id" uuid NOT NULL,
        "staff_profile_id" uuid,
        "short_code" character varying NOT NULL,
        "url" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "metadata" jsonb,
        CONSTRAINT "PK_qr_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_qr_codes_short_code" UNIQUE ("short_code")
      )
    `);

    // Performance indexes for common queries
    await queryRunner.query(`
      CREATE INDEX "IDX_qr_codes_merchant_id" ON "qr_codes" ("merchant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_qr_codes_staff_profile_id" ON "qr_codes" ("staff_profile_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_qr_codes_is_active" ON "qr_codes" ("is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_qr_codes_is_active"`);
    await queryRunner.query(`DROP INDEX "IDX_qr_codes_staff_profile_id"`);
    await queryRunner.query(`DROP INDEX "IDX_qr_codes_merchant_id"`);
    await queryRunner.query(`DROP TABLE "qr_codes"`);
  }
}
