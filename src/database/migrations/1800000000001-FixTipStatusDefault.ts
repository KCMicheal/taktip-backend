import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Fix tip_status default value.
 *
 * The original migration set DEFAULT 0, but TipStatus.COMPLETED = 1.
 * This migration updates the default to match the entity definition.
 * Only affects new rows — existing rows are not changed.
 */
export class FixTipStatusDefault1800000000001 implements MigrationInterface {
  name = 'FixTipStatusDefault1800000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tips" ALTER COLUMN "tip_status" SET DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tips" ALTER COLUMN "tip_status" SET DEFAULT 0
    `);
  }
}
