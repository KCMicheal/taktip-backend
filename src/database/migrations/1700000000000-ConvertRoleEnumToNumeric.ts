import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to convert Role enum from string enum type to integer column
 * 
 * Current state: Role enum uses string enum values ('1', '2', '3', '4')
 * Target state: Role uses integer column (1, 2, 3, 4)
 * 
 * IMPORTANT: This migration MUST:
 * 1. First convert the data (string->int) while enum type still exists
 * 2. Then drop the enum type (now safe since column is no longer using it)
 * 
 * Reversing this requires:
 * 1. Create new enum type with string values
 * 2. Convert data (int->string)
 * 3. Change column to enum type
 */
export class ConvertRoleEnumToNumeric1700000000000 implements MigrationInterface {
  name = 'ConvertRoleEnumToNumeric1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the default first (must be done before type change)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

    // Step 2: Convert column data from string to integer FIRST
    // This works while the enum type still exists
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE integer USING (role::text::integer)
    `);

    // Step 3: Now safe to drop the enum type (column is no longer using it)
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);

    // Step 4: Set the default back (numeric value 2 = MERCHANT)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 2`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the numeric default
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

    // Step 2: Create enum type with string values BEFORE converting data
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('1', '2', '3', '4')
    `);

    // Step 3: Convert data from integer to string (while creating the type first)
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING (role::text)
    `);

    // Step 4: Set the default back (string value '2' = MERCHANT)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT '2'`);
  }
}