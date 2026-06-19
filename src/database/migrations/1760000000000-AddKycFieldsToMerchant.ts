import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycFieldsToMerchant1760000000000 implements MigrationInterface {
  name = 'AddKycFieldsToMerchant1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add kycStatus column with default PENDING (1)
    // NOTE: Uses camelCase to match TypeORM column naming (no naming strategy configured)
    await queryRunner.query(`
      ALTER TABLE "merchants"
      ADD COLUMN "kycStatus" integer NOT NULL DEFAULT 1
    `);

    // Add approvedBy column (nullable, references admin user)
    await queryRunner.query(`
      ALTER TABLE "merchants"
      ADD COLUMN "approvedBy" uuid
    `);

    // Add approvedAt column (nullable timestamp)
    await queryRunner.query(`
      ALTER TABLE "merchants"
      ADD COLUMN "approvedAt" TIMESTAMP
    `);

    // For existing merchants: set kycStatus to APPROVED (2) since they're already active
    await queryRunner.query(`
      UPDATE "merchants"
      SET "kycStatus" = 2
      WHERE "status" = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "merchants"
      DROP COLUMN "approvedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "merchants"
      DROP COLUMN "approvedBy"
    `);

    await queryRunner.query(`
      ALTER TABLE "merchants"
      DROP COLUMN "kycStatus"
    `);
  }
}
