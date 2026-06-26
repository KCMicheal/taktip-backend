import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add customer_profile_id to qr_codes table
 *
 * Makes merchant_id nullable so customer-only QRs can exist without a merchant,
 * and adds customer_profile_id column to support C2C QR code resolution.
 */
export class AddCustomerProfileIdToQrCodes1790000000001 implements MigrationInterface {
  name = 'AddCustomerProfileIdToQrCodes1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "qr_codes" ALTER COLUMN "merchant_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "qr_codes" ADD COLUMN "customer_profile_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_qr_codes_customer_profile_id" ON "qr_codes" ("customer_profile_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_qr_codes_customer_profile_id"`);
    await queryRunner.query(`ALTER TABLE "qr_codes" DROP COLUMN "customer_profile_id"`);
    await queryRunner.query(`
      ALTER TABLE "qr_codes" ALTER COLUMN "merchant_id" SET NOT NULL
    `);
  }
}
