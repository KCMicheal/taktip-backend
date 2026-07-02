import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTOTPColumnsToUsers1800000000004 implements MigrationInterface {
  name = 'AddTOTPColumnsToUsers1800000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "two_factor_secret" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "backup_codes" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "backup_codes"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "two_factor_secret"
    `);
  }
}
