import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCustomerProfilesAvatar1790000000000 implements MigrationInterface {
  name = 'UpdateCustomerProfilesAvatar1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename avatar_url column to avatar and change type to text to support base64
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        RENAME COLUMN "avatar_url" TO "avatar"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        ALTER COLUMN "avatar" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        ALTER COLUMN "avatar" TYPE varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        RENAME COLUMN "avatar" TO "avatar_url"
    `);
  }
}
