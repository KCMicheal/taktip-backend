import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerProfileIdToPayouts1800000000003
  implements MigrationInterface
{
  name = 'AddCustomerProfileIdToPayouts1800000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payouts"
      ADD COLUMN "customer_profile_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payouts_customer_profile_id"
      ON "payouts" ("customer_profile_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_payouts_customer_profile_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "payouts"
      DROP COLUMN "customer_profile_id"
    `);
  }
}
