import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Rename tipStatus column to tip_status in the tips table.
 *
 * The entity @Column for tipStatus was missing `name: 'tip_status'`,
 * so TypeORM's synchronize created it as `tipStatus` (camelCase) instead
 * of `tip_status` (snake_case) to match the original migration schema.
 *
 * This migration renames the column if it exists as tipStatus.
 * If it's already named tip_status, the DO block is a no-op.
 */
export class RenameTipStatusColumn1800000000000 implements MigrationInterface {
  name = 'RenameTipStatusColumn1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tips' AND column_name = 'tipStatus'
        ) THEN
          ALTER TABLE "tips" RENAME COLUMN "tipStatus" TO "tip_status";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tips' AND column_name = 'tip_status'
        ) THEN
          ALTER TABLE "tips" RENAME COLUMN "tip_status" TO "tipStatus";
        END IF;
      END $$;
    `);
  }
}
