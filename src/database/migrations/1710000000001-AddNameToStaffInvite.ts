import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add the `name` column to the `staff_invites` table.
 *
 * This column stores the staff member's full name as provided by the merchant
 * at invite time. It is parsed into firstName/lastName when the invite is accepted.
 *
 * The entity already has @Column({ type: 'varchar', nullable: true }) on `name`,
 * but no migration was generated when the column was added. This ensures the column
 * exists in production/staging environments where synchronize: false.
 */
export class AddNameToStaffInvite1710000000001 implements MigrationInterface {
  name = 'AddNameToStaffInvite1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff_invites"
        ADD COLUMN "name" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff_invites"
        DROP COLUMN IF EXISTS "name"
    `);
  }
}
