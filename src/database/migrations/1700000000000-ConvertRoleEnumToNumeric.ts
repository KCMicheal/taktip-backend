import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to convert Role enum from string enum type to integer column
 * 
 * Current state: Role enum uses string enum values ('1', '2', '3', '4')
 * Target state: Role uses integer column (1, 2, 3, 4)
 * 
 * This migration:
 * 1. Drops the old string enum type
 * 2. Changes the column to integer type
 * 3. Updates existing values from string to integer
 */
export class ConvertRoleEnumToNumeric1700000000000 implements MigrationInterface {
  name = 'ConvertRoleEnumToNumeric1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the default first
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

    // Step 2: Drop the existing string enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);

    // Step 3: Change column to integer type (this keeps the data)
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE integer USING (role::text::integer)
    `);

    // Step 4: Set the default back (numeric value 2 = MERCHANT)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 2`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the numeric default
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

    // Step 2: Create enum type with string values
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('1', '2', '3', '4')
    `);

    // Step 3: Change column to enum type
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING (role::text)
    `);

    // Step 4: Set the default back (string value '2' = MERCHANT)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT '2'`);
  }
}