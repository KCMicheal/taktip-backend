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

## 6. Decimal Columns & String Concatenation Gotcha

### The Issue
Postgres `DECIMAL` / `NUMERIC` columns are returned as **strings** by the `pg` driver (JavaScript's `Number` can't safely represent arbitrary precision). When you use `+` on a string like `"1520.00"`, it performs **string concatenation** instead of numeric addition:

```typescript
const bal = wallet.balanceAvailable; // "1520.00" (string!)
const total = bal + 9.5;             // "1520.009.5" 😱
// Postgres then throws: invalid input syntax for type numeric: "1520.009.5"
```

### The Fix
Always add a `ValueTransformer` to `decimal` columns that converts strings to numbers on read:

```typescript
import { ValueTransformer } from 'typeorm';

const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null =>
    value !== null ? parseFloat(value) : null,
};

// Usage
@Column({ type: 'decimal', precision: 15, scale: 2, transformer: decimalTransformer })
balanceAvailable: number;
```

### Affected Entities
- `wallet.entity.ts` — `balancePending`, `balanceAvailable`, `balanceProcessing`
- `transaction.entity.ts` — `amount`, `fee`, `balanceBefore`, `balanceAfter`

### Raw SQL is safe
Raw queries with `CAST("balance" AS numeric(15,2)) + $1` work fine because the arithmetic happens in Postgres, not JavaScript. Only TypeORM reads (`.find()`, `.findOne()`) are affected.

---

## 7. Naming Conventions

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

### Objective
Keep `develop` and `staging` in lockstep so every PR diff contains **only your new work** — zero unrelated files, zero phantom diffs.

### Pre-Flight: Confirm You're on `develop`
```bash
git rev-parse --abbrev-ref HEAD   # must output "develop"
```

### Step-by-Step Workflow (Rebase Strategy)

**1. Sync: rebase `develop` onto `origin/staging`**
```bash
git fetch origin
git rebase origin/staging
```
This rewinds `develop` to match `staging`, then replays your uncommitted local work on top. The result is `develop` = `staging` + your changes with a clean linear history.

**2. Stage and commit your work**
```bash
git add .
git commit -m "feat(scope): concise description of the change"
```

**3. Push `develop` to remote**
```bash
git push origin develop
```
> After a rebase that rewrote history you'd already pushed, use `--force-with-lease` instead of plain `--force`. This is safe because only **you** work on `develop`.

**4. Create a PR targeting `staging`**
```bash
gh pr create \
  --base staging \
  --head develop \
  --title "$(git log -1 --pretty=%s)" \
  --body "Link to ticket / what changed / how to test"
```

**5. Trigger OpenCode review**
```
/oc please review this PR
```

### Visual Flow

```
Before sync:
  staging:  S1 ─── S2 ─── S3
  develop:  S1 ─── S2 ─── D1 ─── D2

Step 1 (git fetch origin && git rebase origin/staging):
  staging:  S1 ─── S2 ─── S3
  develop:  S1 ─── S2 ─── S3 ─── D1' ─── D2'
                                          ↑ rebased on top of S3

Steps 2-4 (commit, push, PR):
  staging:  S1 ─── S2 ─── S3
  develop:  S1 ─── S2 ─── S3 ─── D1' ─── D2' ─── D3
                                                   ↑ new commit, PR → staging
```

### Why Rebase Over Merge?

| Aspect | Merge | Rebase ✅ |
|--------|-------|-----------|
| History | Merge commits pollute `develop` | Linear, readable |
| PR diff | Shows "merge staging into develop" noise | Only your changes |
| Revert | Complicated — must understand merge-parents | `git revert <sha>` works cleanly |
| Conflict resolution | Once at merge, once at PR | Once at rebase (before commit) |

### Divergence Prevention Rules

1. **`staging` is PR-only** — enable branch protection on GitHub to block direct pushes
2. **Always sync first** — never commit on `develop` without rebasing onto `origin/staging` first
3. **After PR merge, refresh `develop`** — delete the remote `develop` branch and recreate it from the new `staging`:
   ```bash
   git checkout staging && git pull origin staging
   git branch -D develop && git checkout -b develop
   git push origin develop
   ```
   This guarantees `develop` is always exactly `staging` at the start of the next cycle.

---

## 9. Pre-Commit & Pre-Push Checklist

Before committing and pushing any code, verify:

### Git Sync
- [ ] **Rebase first** — `git fetch origin && git rebase origin/staging` (Section 8, Step 1)
- [ ] No merge commits or conflicts in staging files that aren't yours
- [ ] Confirm you're on `develop` branch

### Unit & Integration Tests
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes  
- [ ] `pnpm run test` passes (all relevant test suites)

### Live Endpoint Verification
After unit tests pass, **all changed/new endpoints MUST be tested against the running local dev server**:
- [ ] Local dev server is running (`node dist/src/main.js` or `pnpm run start:dev`)
- [ ] **All related endpoints are exercised with curl** and the responses validated (status codes, response body shape, edge cases)
  - For new endpoints: exercise success path, validation errors (400), auth/role enforcement (401/403), 404 cases
  - For modified endpoints: verify old behavior is preserved AND new behavior works
- [ ] The verification results are captured in a test script or documented inline to make re-verification easy after DB resets
- [ ] Test users are created fresh as needed (DB is ephemeral — Docker containers lose data on recreate)
- [ ] All 8/8 (or equivalent) endpoint checks pass before push

### Code Quality
- [ ] No hardcoded secrets or credentials
- [ ] New entities added to `data-source.ts` entities array
- [ ] Ownership checks implemented for protected endpoints
- [ ] Numeric enum validation uses `typeof === 'number'`
- [ ] Migration file created/updated for every entity schema change

---

## 10. Local Test Users & Credentials

### Important: Ephemeral Database
The local Postgres database runs in Docker. When the container is recreated (e.g., `docker compose up -d` with a new container), **all data is lost**. Test users must be recreated each time.

### Registration Flow for New Test Users
```bash
# 1. Register via API
curl -X POST http://localhost:3001/api/v1/auth/register/customer \
  -H "Content-Type: application/json" \
  -d '{"email":"customer.test@example.com","password":"TestPass123!","firstName":"Test","lastName":"Customer"}'

# 2. Retrieve OTP from server logs
grep "OTP for customer.test" /tmp/server.log
# Expected: [DEV] OTP for customer.test@example.com: XXXXXX

# 3. Verify email
curl -X POST http://localhost:3001/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"customer.test@example.com","otp":"XXXXXX"}'

# 4. Login to get JWT
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"customer.test@example.com","password":"TestPass123!"}'
```

### Currently Used Test Users (will need re-creation after DB reset)

**Customer** (for C2C QR code / customer endpoints)
| Field | Value |
|-------|-------|
| Email | `customer.test@example.com` |
| Password | `TestPass123!` |
| Login identifier field | `identifier` (not `email`) |
| Role | CUSTOMER (1) |
| Customer Profile ID | Auto-generated (check DB or POST response) |
| Auth header | `Authorization: Bearer <jwt>` |

**Merchant** (for merchant endpoints — register as needed)
```bash
# Register merchant
curl -X POST http://localhost:3001/api/v1/auth/register/merchant \
  -H "Content-Type: application/json" \
  -d '{"email":"merchant.test@example.com","password":"TestPass123!","businessName":"Test Merchant"}'
# Then retrieve OTP from logs, verify, and login with identifier field.
```

### Notes
- Login endpoint uses `identifier` field (not `email`), accepts both email and phone.
- The OTP is 6 digits (each 0-7), logged to console in dev mode.
- Tokens expire after 30 minutes (`expiresIn: 1800` seconds).
- Customer profiles are auto-created on registration.
- The server log file is at `/tmp/server.log` when started via `nohup node dist/src/main.js > /tmp/server.log 2>&1 &`.

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

*Last Updated: 2026-06-30*
*Version: 4.0 — Rebased PR workflow: sync-first strategy + divergence prevention rules*
