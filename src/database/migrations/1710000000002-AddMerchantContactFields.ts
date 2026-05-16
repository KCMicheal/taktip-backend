import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add contact and location fields to the `merchants` table.
 *
 * Adds: email, phone, city, state, zip, country
 * All fields are nullable varchar to support partial updates.
 */
export class AddMerchantContactFields1710000000002 implements MigrationInterface {
  name = 'AddMerchantContactFields1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "merchants"
        ADD COLUMN "email" varchar NULL,
        ADD COLUMN "phone" varchar NULL,
        ADD COLUMN "city" varchar NULL,
        ADD COLUMN "state" varchar NULL,
        ADD COLUMN "zip" varchar NULL,
        ADD COLUMN "country" varchar DEFAULT 'NG'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "merchants"
        DROP COLUMN IF EXISTS "email",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "state",
        DROP COLUMN IF EXISTS "zip",
        DROP COLUMN IF EXISTS "country"
    `);
  }
}
