import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add unique constraint on (owner_id, owner_type) for wallets table
 *
 * When the wallet schema was refactored from merchantId → polymorphic
 * (owner_id + owner_type), the old unique constraint UQ_wallets_merchantId
 * was dropped but no replacement was added.
 *
 * Without this constraint, concurrent requests can create duplicate wallets
 * for the same owner, leading to ambiguous findOne reads and inconsistent
 * balances. The service methods (createWallet, getOrCreateMerchantWallet,
 * createStaffWallet, createCustomerWallet) all assume single-wallet-per-owner.
 *
 * The constraint also enables efficient ON CONFLICT DO NOTHING / ON CONFLICT DO UPDATE
 * upsert patterns for wallet creation idempotency.
 */
export class AddWalletOwnerUniqueConstraint1720000000005 implements MigrationInterface {
  name = 'AddWalletOwnerUniqueConstraint1720000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets"
        ADD CONSTRAINT "UQ_wallets_owner"
        UNIQUE ("owner_id", "owner_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets"
        DROP CONSTRAINT IF EXISTS "UQ_wallets_owner"
    `);
  }
}
