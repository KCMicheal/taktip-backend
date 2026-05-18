import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomerProfilesTable1720000000003 implements MigrationInterface {
  name = 'CreateCustomerProfilesTable1720000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" integer NOT NULL DEFAULT 1,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_customer_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_profiles_userId" UNIQUE ("userId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        ADD CONSTRAINT "FK_customer_profiles_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "customer_profiles" DROP CONSTRAINT IF EXISTS "FK_customer_profiles_userId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "customer_profiles"');
  }
}
