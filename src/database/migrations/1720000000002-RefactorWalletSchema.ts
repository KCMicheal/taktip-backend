import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorWalletSchema1720000000002 implements MigrationInterface {
  name = 'RefactorWalletSchema1720000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop old foreign key constraint
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_merchantId"',
    );

    // 2. Drop unique constraint on merchantId
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "UQ_wallets_merchantId"',
    );

    // 3. Rename merchantId to owner_id
    await queryRunner.query(
      'ALTER TABLE "wallets" RENAME COLUMN "merchantId" TO "owner_id"',
    );

    // 4. Add owner_type (discriminator) — default 'merchant' for existing rows
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD "owner_type" varchar NOT NULL DEFAULT 'merchant'`,
    );

    // 5. Rename balance to balance_available
    await queryRunner.query(
      'ALTER TABLE "wallets" RENAME COLUMN "balance" TO "balance_available"',
    );

    // 6. Add balance_pending
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD "balance_pending" decimal(15,2) NOT NULL DEFAULT 0',
    );

    // 7. Add balance_processing
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD "balance_processing" decimal(15,2) NOT NULL DEFAULT 0',
    );

    // 8. Add locked_until (nullable timestamp)
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD "locked_until" timestamp NULL',
    );

    // 9. Migrate existing data: set owner_type = 'merchant' for all current wallets
    //    (owner_id already contains the merchant UUID from the rename)
    await queryRunner.query(
      `UPDATE "wallets" SET "owner_type" = 'merchant' WHERE "owner_type" IS NULL OR "owner_type" = ''`,
    );

    // 10. Add balance tracking columns to transactions table
    await queryRunner.query(
      'ALTER TABLE "transactions" ADD "balance_before" decimal(15,2) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "transactions" ADD "balance_after" decimal(15,2) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse transaction changes
    await queryRunner.query(
      'ALTER TABLE "transactions" DROP COLUMN "balance_after"',
    );
    await queryRunner.query(
      'ALTER TABLE "transactions" DROP COLUMN "balance_before"',
    );

    // Reverse wallet changes
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP COLUMN "locked_until"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP COLUMN "balance_processing"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP COLUMN "balance_pending"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" RENAME COLUMN "balance_available" TO "balance"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP COLUMN "owner_type"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" RENAME COLUMN "owner_id" TO "merchantId"',
    );

    // Restore old constraints
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD CONSTRAINT "UQ_wallets_merchantId" UNIQUE ("merchantId")',
    );
    await queryRunner.query(`
      ALTER TABLE "wallets"
        ADD CONSTRAINT "FK_wallets_merchantId"
        FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE
    `);
  }
}
