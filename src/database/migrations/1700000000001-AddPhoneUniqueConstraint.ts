import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add a unique constraint on the phone column of the users table.
 *
 * The entity already has @Column({ unique: true }) on phone, but no migration
 * was generated when that constraint was added. This ensures the constraint
 * exists in production environments where synchronize: false.
 *
 * PostgreSQL allows multiple NULL values in unique indexes, so nullable phones
 * are handled correctly without needing a partial index.
 */
export class AddPhoneUniqueConstraint1700000000001 implements MigrationInterface {
  name = 'AddPhoneUniqueConstraint1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_phone"
        ON "users" ("phone")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_phone"
    `);
  }
}
