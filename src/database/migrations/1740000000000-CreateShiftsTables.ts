import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create shifts and shift_staff tables
 *
 * - shifts:  Core shift entity owned by a merchant.
 * - shift_staff:  Join/pivot table linking staff profiles to shifts, tracking
 *   clock-in/out times, tips earned, and assignment status.
 *
 * Shift lifecycle status (integer):
 *   1 = DRAFT, 2 = PUBLISHED, 3 = IN_PROGRESS, 4 = COMPLETED, 5 = CANCELLED
 *
 * Shift_staff assignment status (integer):
 *   1 = ASSIGNED, 2 = CLOCKED_IN, 3 = CLOCKED_OUT, 4 = NO_SHOW
 */
export class CreateShiftsTables1740000000000 implements MigrationInterface {
  name = 'CreateShiftsTables1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- shifts table ----------
    await queryRunner.query(`
      CREATE TABLE "shifts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchantId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "startsAt" TIMESTAMP NOT NULL,
        "endsAt" TIMESTAMP NOT NULL,
        "status" integer NOT NULL DEFAULT 1,
        "distributionPolicy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shifts_id" PRIMARY KEY ("id")
      )
    `);

    // Performance indexes for common queries
    await queryRunner.query(`
      CREATE INDEX "idx_shifts_merchant_id" ON "shifts" ("merchantId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_shifts_status" ON "shifts" ("status")
    `);

    // FK to merchants table
    await queryRunner.query(`
      ALTER TABLE "shifts"
        ADD CONSTRAINT "FK_shifts_merchant_id"
        FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE
    `);

    // ---------- shift_staff table ----------
    await queryRunner.query(`
      CREATE TABLE "shift_staff" (
        "shiftId" uuid NOT NULL,
        "staffProfileId" uuid NOT NULL,
        "clockedInAt" TIMESTAMP,
        "clockedOutAt" TIMESTAMP,
        "tipsEarned" decimal(10,2),
        "status" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_shift_staff" PRIMARY KEY ("shiftId", "staffProfileId")
      )
    `);

    // Performance indexes
    await queryRunner.query(`
      CREATE INDEX "idx_shift_staff_shift_id" ON "shift_staff" ("shiftId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_shift_staff_staff_id" ON "shift_staff" ("staffProfileId")
    `);

    // FK to shifts table
    await queryRunner.query(`
      ALTER TABLE "shift_staff"
        ADD CONSTRAINT "FK_shift_staff_shift_id"
        FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE
    `);

    // FK to staff_profiles table
    await queryRunner.query(`
      ALTER TABLE "shift_staff"
        ADD CONSTRAINT "FK_shift_staff_staff_profile_id"
        FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FKs on shift_staff
    await queryRunner.query(
      'ALTER TABLE "shift_staff" DROP CONSTRAINT IF EXISTS "FK_shift_staff_staff_profile_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "shift_staff" DROP CONSTRAINT IF EXISTS "FK_shift_staff_shift_id"',
    );

    // Drop indexes on shift_staff
    await queryRunner.query('DROP INDEX IF EXISTS "idx_shift_staff_staff_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_shift_staff_shift_id"');

    // Drop shift_staff table
    await queryRunner.query('DROP TABLE IF EXISTS "shift_staff"');

    // Drop FK on shifts
    await queryRunner.query(
      'ALTER TABLE "shifts" DROP CONSTRAINT IF EXISTS "FK_shifts_merchant_id"',
    );

    // Drop indexes on shifts
    await queryRunner.query('DROP INDEX IF EXISTS "idx_shifts_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_shifts_merchant_id"');

    // Drop shifts table
    await queryRunner.query('DROP TABLE IF EXISTS "shifts"');
  }
}
