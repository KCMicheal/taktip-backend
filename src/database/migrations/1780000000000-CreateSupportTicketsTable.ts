import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create support_tickets table
 *
 * Tracks support / escalation requests submitted by merchants or created by admins.
 */
export class CreateSupportTicketsTable1780000000000 implements MigrationInterface {
  name = 'CreateSupportTicketsTable1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "merchant_id" uuid,
        "subject" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "ticketStatus" integer NOT NULL DEFAULT 1,
        "priority" integer NOT NULL DEFAULT 2,
        "assigned_to" uuid,
        "notes" text,
        "resolved_at" TIMESTAMP,
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("ticketStatus")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_support_tickets_priority" ON "support_tickets" ("priority")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_support_tickets_assigned" ON "support_tickets" ("assigned_to")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_support_tickets_created_at" ON "support_tickets" ("createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_support_tickets_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_support_tickets_assigned"`);
    await queryRunner.query(`DROP INDEX "IDX_support_tickets_priority"`);
    await queryRunner.query(`DROP INDEX "IDX_support_tickets_status"`);
    await queryRunner.query(`DROP TABLE "support_tickets"`);
  }
}
