import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to create the staff_profiles table
 *
 * This table links a User to a Merchant and stores staff-specific data
 * such as display name, role tag, clock-in status, payout method, and settings.
 */
export class CreateStaffProfilesTable1710000000000 implements MigrationInterface {
  name = 'CreateStaffProfilesTable1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff_profiles" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "status"        integer NOT NULL DEFAULT 1,
        "createdAt"     timestamp NOT NULL DEFAULT now(),
        "updatedAt"     timestamp NOT NULL DEFAULT now(),

        "userId"        uuid NOT NULL,
        "merchantId"    uuid,
        "displayName"   varchar,
        "roleTag"       varchar,
        "isClockedIn"   boolean NOT NULL DEFAULT false,
        "currentShiftId" uuid,
        "payoutMethod"  jsonb,
        "settings"      jsonb,

        CONSTRAINT "PK_staff_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_profiles_merchantId_userId" UNIQUE ("merchantId", "userId"),
        CONSTRAINT "FK_staff_profiles_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_profiles_merchant" FOREIGN KEY ("merchantId")
          REFERENCES "merchants"("id") ON DELETE SET NULL
      )
    `);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "staff_profiles"`);
  }
}
