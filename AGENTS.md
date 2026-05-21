# TakTip Backend - Agent Guidelines

## Overview

This document captures key learnings and patterns for developing the TakTip Backend with NestJS. All agents should follow these guidelines to avoid common pitfalls.

---

## 1. Numeric Enum Validation

### The Issue
When using numeric enums in TypeScript, `Object.values(Enum)` returns BOTH numeric values AND reverse-mapped strings:

```typescript
enum Role {
  CUSTOMER = 1,
  MERCHANT = 2,
  STAFF = 3,
  ADMIN = 4,
}

// Object.values(Role) returns: [1, 2, 3, 4, 'CUSTOMER', 'MERCHANT', 'STAFF', 'ADMIN']
```

### The Problem
When the database column is an integer type, passing a string like `"MERCHANT"` to `findOne({ role })` causes a database error instead of the intended graceful handling.

### The Fix
Always validate that the input is the correct type:

```typescript
// ❌ WRONG - accepts strings that will fail in DB
if (!role || !Object.values(Role).includes(role))

// ✅ CORRECT - rejects strings, only accepts numbers
if (!role || typeof role !== 'number' || !Object.values(Role).includes(role))
```

---

## 2. Database Migration Order

### The Issue
When converting from string enum to integer, you MUST convert data BEFORE dropping the type.

### The Problem
Dropping the enum type before converting the column leaves the database in an inconsistent state, and string values like `"MERCHANT"` cannot be cast to integer.

### The Fix
Always convert data FIRST, then drop the type:

```typescript
// ❌ WRONG - drops type before converting data
await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE integer ...`);

// ✅ CORRECT - converts data while type still exists, then drops
await queryRunner.query(`
  ALTER TABLE "users" ALTER COLUMN "role" TYPE integer USING (role::text::integer)
`);
await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
```

---

## 3. TypeORM DataSource Configuration

### The Issue
The `data-source.ts` used for migrations must include ALL entities, not just a subset.

### The Problem
If you only include `user.entity.js`, new entities like `Merchant`, `PasswordReset` won't be included in migration generation, causing incomplete schema diffs.

### The Fix
Always include all entity paths:

```typescript
// ❌ WRONG - only includes one entity
entities: [path.join(__dirname, 'src/auth/entities/user.entity.js')]

// ✅ CORRECT - includes all entities
entities: [
  path.join(__dirname, 'src/auth/entities/*.entity{.ts,.js}'),
  path.join(__dirname, 'src/merchant/entities/*.entity{.ts,.js}'),
]
```

---

## 4. Migration Workflow — Production Deployment

### The Issue
The app uses `synchronize: true` in dev (auto-syncs schema on restart) and `synchronize: false` in production/staging. **Migrations do NOT auto-run on deploy or restart** — there is no `migrationsRun: true` in the TypeORM config.

### The Problem
If you deploy code with new entity columns but forget to run the migration, the columns won't exist in production. The app will still function (nullable columns are safe to query), but the new fields won't be populated.

### The Fix — Deployment Procedure
Always run migrations manually after a code deploy:

```bash
# After code is deployed and the app has restarted:
pnpm run migration:run
```

**For schema-only changes** (adding nullable columns), it's safe to run immediately after deploy. For data migrations, run before the app starts to avoid race conditions.

### Creating a Migration
When you add/modify a database column in an entity:

1. Write the migration manually (following existing patterns in `src/database/migrations/`), OR
2. Generate it from the entity diff (requires a running database):
   ```bash
   pnpm run migration:generate src/database/migrations/<Timestamp>-<Description>
   ```

**Manual migration template** (safe to write by hand for simple column additions):

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class YourMigrationName<timestamp> implements MigrationInterface {
  name = 'YourMigrationName<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "your_table"
      ADD COLUMN "your_column" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "your_table"
      DROP COLUMN "your_column"
    `);
  }
}
```

### Migration Commands Cheat Sheet
```bash
pnpm run migration:run        # Apply all pending migrations
pnpm run migration:revert      # Revert the last migration
pnpm run migration:show        # List all migrations and their status
pnpm run migration:generate    # Auto-generate from entity diff
```

### When NOT to migrate
For pure code changes (no schema modifications like route fixes, new endpoints, renamed methods), no migration is needed. Only run migrations when entities change.

---

## 5. Ownership Checks for Protected Resources

### The Issue
Endpoints that modify resources (PUT, DELETE) must verify the authenticated user owns the resource or has appropriate permissions.

### The Problem
Without ownership checks, any authenticated user could modify other users' resources by knowing the resource ID.

### The Fix
Always verify ownership in the controller:

```typescript
// ❌ WRONG - no ownership check
async updateMerchant(@Param('id') id: string, @Body() dto: UpdateDto) {
  return this.merchantService.updateMerchant(id, dto);
}

// ✅ CORRECT - verifies ownership before update
async updateMerchant(
  @Param('id') id: string,
  @Body() dto: UpdateDto,
  @CurrentUser() user: { sub: string },
) {
  const merchant = await this.merchantService.getMerchantById(id);
  if (merchant.ownerId !== user.sub) {
    throw new ForbiddenException('Not authorized to update this merchant');
  }
  return this.merchantService.updateMerchant(id, dto);
}
```

---

## 6. Naming Conventions

### API Documentation Alignment
When the API documentation (PDF) specifies a name (e.g., "Merchant"), use that name in code rather than generic terms like "Business":

- Documentation: `Merchant`, `/api/v1/merchant/*`
- Code: Use `Merchant`, not `Business`
- Database: `merchants` table

---

## 7. ShortCode Generation

### Uniqueness Guarantee
Always check for collisions when generating unique codes:

```typescript
async generateUniqueShortCode(businessName: string): Promise<string> {
  const maxAttempts = 10;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const shortCode = this.generateShortCode(businessName);
    const existing = await this.merchantRepository.findOne({ where: { shortCode } });
    if (!existing) return shortCode;
  }
  
  throw new ConflictException('Unable to generate unique short code');
}
```

---

## 8. PR/Commit Workflow

### Git Workflow (Per User Requirement)
1. Push changes to `develop` branch
2. Rebase `develop` with `staging` (or rebase onto staging)
3. Create PR to `staging` (not main)
4. Trigger OpenCode review with `/oc please review this PR`

---

## 9. Pre-Commit Checklist

Before pushing any code, verify:
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes  
- [ ] `pnpm run test` passes (all tests)
- [ ] No hardcoded secrets or credentials
- [ ] New entities added to `data-source.ts` entities array
- [ ] Ownership checks implemented for protected endpoints
- [ ] Numeric enum validation uses `typeof === 'number'`
- [ ] Migration file created/updated for every entity schema change

---

## Common Patterns

### NestJS Module Structure
```
src/module/
├── module.controller.ts   # HTTP endpoints
├── module.service.ts      # Business logic
├── dto/                   # Request/Response DTOs
├── entities/              # TypeORM entities
└── module.ts              # Module definition
```

### Always Use
- `@nestjs/swagger` decorators (`@ApiTags`, `@ApiOperation`, etc.)
- Class-validator for DTO validation
- Global response interceptor (already configured)
- Global exception filter (already configured)

### Testing
- Unit tests for all services
- Mock external dependencies
- Test both success and error paths

---

*Last Updated: 2026-05-21*
*Version: 2.0*