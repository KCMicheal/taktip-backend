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

## 4. Ownership Checks for Protected Resources

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

## 5. Naming Conventions

### API Documentation Alignment
When the API documentation (PDF) specifies a name (e.g., "Merchant"), use that name in code rather than generic terms like "Business":

- Documentation: `Merchant`, `/api/v1/merchant/*`
- Code: Use `Merchant`, not `Business`
- Database: `merchants` table

---

## 6. ShortCode Generation

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

## 7. PR/Commit Workflow

### Git Workflow (Per User Requirement)
1. Push changes to `develop` branch
2. Rebase `develop` with `staging` (or rebase onto staging)
3. Create PR to `staging` (not main)
4. Trigger OpenCode review with `/oc please review this PR`

---

## 8. Pre-Commit Checklist

Before pushing any code, verify:
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes  
- [ ] `pnpm run test` passes (all tests)
- [ ] No hardcoded secrets or credentials
- [ ] New entities added to `data-source.ts` entities array
- [ ] Ownership checks implemented for protected endpoints
- [ ] Numeric enum validation uses `typeof === 'number'`

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

*Last Updated: 2026-05-04*
*Version: 1.0*