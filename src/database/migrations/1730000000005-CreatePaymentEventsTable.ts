import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create payment_events table
 *
 * Append-only audit log for every event in the payment lifecycle.
 * Each row records a single interaction with a payment provider —
 * initialization, verification, webhook receipt, success, failure, etc.
 * This table is INSERT-only (no updates, no deletes) to preserve the
 * audit trail for accounting, reporting, and failure analysis.
 */
export class CreatePaymentEventsTable1730000000005 implements MigrationInterface {
  name = 'CreatePaymentEventsTable1730000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL,
        "provider" character varying NOT NULL,
        "event" character varying NOT NULL,
        "payload" jsonb,
        "status" character varying NOT NULL DEFAULT 'success',
        "error_message" text,
        "ip_address" character varying,
        "user_agent" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_events" PRIMARY KEY ("id")
      )
    `);

    // Performance indexes for common audit queries
    await queryRunner.query(`
      CREATE INDEX "idx_payment_events_payment_id" ON "payment_events" ("payment_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payment_events_provider_event" ON "payment_events" ("provider", "event")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payment_events_created_at" ON "payment_events" ("createdAt")
    `);

    // FK to payments table
    await queryRunner.query(`
      ALTER TABLE "payment_events"
        ADD CONSTRAINT "FK_payment_events_payment_id"
        FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "payment_events" DROP CONSTRAINT IF EXISTS "FK_payment_events_payment_id"',
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_events_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_events_provider_event"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_events_payment_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_events"`);
  }
}
