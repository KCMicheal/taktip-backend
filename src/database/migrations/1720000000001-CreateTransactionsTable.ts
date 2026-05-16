import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1720000000001 implements MigrationInterface {
  name = 'CreateTransactionsTable1720000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "walletId" uuid NOT NULL,
        "type" integer NOT NULL,
        "amount" decimal(15,2) NOT NULL,
        "fee" decimal(15,2) NOT NULL DEFAULT 0,
        "reference" varchar NOT NULL,
        "description" varchar NULL,
        "transactionStatus" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_reference" UNIQUE ("reference")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "FK_transactions_walletId"
        FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_walletId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "transactions"');
  }
}
