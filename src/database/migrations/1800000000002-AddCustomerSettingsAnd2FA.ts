import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerSettingsAnd2FA1800000000002 implements MigrationInterface {
  name = 'AddCustomerSettingsAnd2FA1800000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add JSONB columns to customer_profiles for settings and payment methods
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      ADD COLUMN "notification_preferences" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      ADD COLUMN "preferences" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      ADD COLUMN "payment_methods" jsonb
    `);

    // Add 2FA column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "is_two_factor_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      DROP COLUMN "payment_methods"
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      DROP COLUMN "preferences"
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      DROP COLUMN "notification_preferences"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "is_two_factor_enabled"
    `);
  }
}
