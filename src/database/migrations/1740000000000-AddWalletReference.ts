import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletReference1740000000000 implements MigrationInterface {
  name = 'AddWalletReference1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add reference column as nullable (existing rows don't have one yet)
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD "reference" character varying NULL',
    );

    // 2. Backfill existing rows with unique references using a PL/pgSQL block
    //    Generates WAL-XXXXXX references with collision checking
    await queryRunner.query(`
      DO $$
      DECLARE
        w RECORD;
        ref_text VARCHAR;
        chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        i INTEGER;
        max_attempts INTEGER := 10;
        attempt INTEGER;
      BEGIN
        FOR w IN SELECT "id" FROM "wallets" WHERE "reference" IS NULL LOOP
          attempt := 0;
          <<retry_loop>>
          LOOP
            attempt := attempt + 1;
            IF attempt > max_attempts THEN
              RAISE EXCEPTION 'Unable to generate unique wallet reference for wallet %', w.id;
            END IF;

            ref_text := 'WAL-';
            FOR i IN 1..6 LOOP
              ref_text := ref_text || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
            END LOOP;

            -- Check uniqueness
            IF NOT EXISTS (SELECT 1 FROM "wallets" WHERE "reference" = ref_text) THEN
              UPDATE "wallets" SET "reference" = ref_text WHERE "id" = w.id;
              EXIT retry_loop;
            END IF;
          END LOOP;
        END LOOP;
      END $$;
    `);

    // 3. Add unique constraint on reference
    await queryRunner.query(
      'ALTER TABLE "wallets" ADD CONSTRAINT "UQ_wallets_reference" UNIQUE ("reference")',
    );

    // 4. Make reference NOT NULL now that all rows have values
    await queryRunner.query(
      'ALTER TABLE "wallets" ALTER COLUMN "reference" SET NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "UQ_wallets_reference"',
    );
    await queryRunner.query(
      'ALTER TABLE "wallets" DROP COLUMN "reference"',
    );
  }
}
