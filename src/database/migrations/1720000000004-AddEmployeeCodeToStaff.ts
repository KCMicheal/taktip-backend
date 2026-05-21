import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add employeeCode column to staff_profiles and staff_invites tables
 *
 * This migration adds an optional employeeCode field that is passed through
 * the invite flow (InviteStaffDto → StaffInvite → StaffProfile on accept).
 *
 * The column is nullable/varchar since employeeCode is an optional field
 * that merchants may choose to assign to their staff members.
 */
export class AddEmployeeCodeToStaff1720000000004 implements MigrationInterface {
  name = 'AddEmployeeCodeToStaff1720000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add employeeCode column to staff_profiles table
    await queryRunner.query(`
      ALTER TABLE "staff_profiles"
      ADD COLUMN "employeeCode" character varying
    `);

    // Add employeeCode column to staff_invites table
    await queryRunner.query(`
      ALTER TABLE "staff_invites"
      ADD COLUMN "employeeCode" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove employeeCode column from staff_invites table
    await queryRunner.query(`
      ALTER TABLE "staff_invites"
      DROP COLUMN "employeeCode"
    `);

    // Remove employeeCode column from staff_profiles table
    await queryRunner.query(`
      ALTER TABLE "staff_profiles"
      DROP COLUMN "employeeCode"
    `);
  }
}
