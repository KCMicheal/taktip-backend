import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletsTable1720000000000 implements MigrationInterface {
  name = 'CreateWalletsTable1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "merchantId" uuid NOT NULL,
        "balance" decimal(15,2) NOT NULL DEFAULT 0,
        "currency" varchar NOT NULL DEFAULT 'NGN',
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_merchantId" UNIQUE ("merchantId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "wallets"
        ADD CONSTRAINT "FK_wallets_merchantId"
        FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_merchantId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "wallets"');
  }
}
