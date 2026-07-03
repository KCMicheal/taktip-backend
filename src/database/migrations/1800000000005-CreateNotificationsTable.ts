import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1800000000005 implements MigrationInterface {
  name = 'CreateNotificationsTable1800000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" VARCHAR NOT NULL,
        "title" VARCHAR NOT NULL,
        "body" VARCHAR NOT NULL,
        "data" JSONB DEFAULT '{}',
        "read_at" TIMESTAMP NULL,
        "status" INTEGER DEFAULT 1,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_id" ON "notifications"("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_unread" ON "notifications"("user_id") WHERE "read_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_user_unread"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
