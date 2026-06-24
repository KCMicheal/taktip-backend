import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddC2CTipFields1762000000000 implements MigrationInterface {
  name = 'AddC2CTipFields1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add customer profile fields for C2C tipping (display name & avatar)
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      ADD COLUMN "display_name" character varying,
      ADD COLUMN "avatar_url" character varying
    `);

    // Add C2C tip columns to the tips table
    await queryRunner.query(`
      ALTER TABLE "tips"
      ADD COLUMN "sender_id" uuid,
      ADD COLUMN "sender_type" integer,
      ADD COLUMN "recipient_type" character varying,
      ADD COLUMN "funding_source" integer,
      ADD COLUMN "sender_wallet_id" uuid
    `);

    // Add index on sender_id for efficient lookups of sent tips
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tips_sender_id" ON "tips" ("sender_id")
    `);

    // Add index on recipient_type for filtering C2C vs staff tips
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tips_recipient_type" ON "tips" ("recipient_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tips_recipient_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tips_sender_id"`);

    // Drop C2C tip columns
    await queryRunner.query(`
      ALTER TABLE "tips"
      DROP COLUMN "sender_wallet_id",
      DROP COLUMN "funding_source",
      DROP COLUMN "recipient_type",
      DROP COLUMN "sender_type",
      DROP COLUMN "sender_id"
    `);

    // Drop customer profile fields
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
      DROP COLUMN "avatar_url",
      DROP COLUMN "display_name"
    `);
  }
}
