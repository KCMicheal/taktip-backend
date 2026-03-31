# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🏗️ Project Overview

**TakTip** is a digital tipping and gratuity management SaaS platform built with NestJS. It's designed for service businesses (restaurants, salons, healthcare, delivery services) to enable QR-code-based tipping, real-time earnings tracking, shift management, and seamless payouts.

**Key Stats:**
- **Framework**: NestJS 10 (strict TypeScript 5)
- **Database**: PostgreSQL 16 with TypeORM 0.3
- **Cache/Queue**: Redis 7 + BullMQ
- **Authentication**: JWT with Ed25519 asymmetric keys
- **API Docs**: Swagger/OpenAPI 3.1
- **Testing**: Jest (ts-jest)
- **Package Manager**: pnpm
- **Status**: Sprint 1 Foundation (IN PROGRESS)

---

## 📁 Project Structure

```
taktip-backend/
├── src/
│   ├── auth/              # Authentication & authorization module
│   │   ├── decorators/   # Custom decorators (CurrentUser, Public, Roles)
│   │   ├── enums/        # Role enum
│   │   ├── guards/       # JWT guard, Roles guard
│   │   └── services/     # Auth services (JWT strategy, etc.)
│   ├── health/           # Health check endpoints (already implemented)
│   ├── app.module.ts     # Root module (TypeORM, Config, Health)
│   └── main.ts           # Bootstrap (Swagger, validation pipe)
├── test/                 # Integration & unit tests (mirrors src structure)
├── keys/                 # JWT Ed25519 keys (gitignored)
├── docker-compose.yml    # Postgres + Redis for local dev
├── .env.example          # Environment template
├── jest.config.js        # Jest configuration
├── nest-cli.json         # NestJS CLI config
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies & scripts
```

**Note**: Entities, DTOs, and services for features (users, merchants, staff, tipping, wallet, payments, notifications, admin) are planned but not yet implemented.

---

## 🚀 Common Development Commands

### Setup & Installation
```bash
# Install dependencies (first time)
pnpm install

# Generate JWT keys (required)
mkdir -p keys && node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
fs.writeFileSync('keys/ed25519_private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync('keys/ed25519_public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
"

# Configure environment
cp .env.example .env
# Edit .env with your database credentials
```

### Development
```bash
# Start dev server with hot reload
pnpm run start:dev

# Build for production
pnpm run build

# Start production server
pnpm run start:prod
```

### Database
```bash
# Run TypeORM CLI
pnpm run typeorm -- <command>

# Example: generate migration
pnpm run typeorm migration:generate -n MigrationName

# Example: run migrations
pnpm run typeorm migration:run
```

### Linting & Formatting
```bash
# ESLint
pnpm run lint
pnpm run lint -- --fix  # Auto-fix

# Prettier
pnpm run format

# Type checking
pnpm run typecheck
```

### Testing
```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run coverage
pnpm run test:cov

# Run single test file
pnpm run test -- path/to/testfile.spec.ts

# Run tests with pattern
pnpm run test -- --testNamePattern="should do X"

# E2E tests (when available)
pnpm run test:e2e
```

### Pre-commit Hooks
```bash
# The project includes a pre-push hook that runs quality checks
# To manually run the same checks:
./scripts/check-pr-review.sh
# (Requires GitHub CLI `gh` to be installed)
```

### Docker
```bash
# Start local services (Postgres + Redis)
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f postgres
docker compose logs -f redis

# Reset database (WARNING: deletes data)
docker compose down -v
docker compose up -d
```

---

## 🏛️ Architecture Patterns

### NestJS Module Structure
Each feature module follows this pattern:
```
feature/
├── feature.module.ts      # Module definition (imports, controllers, providers)
├── feature.controller.ts  # HTTP endpoints (REST/GraphQL)
├── feature.service.ts     # Business logic
├── dto/                   # Data Transfer Objects
│   ├── create.dto.ts
│   └── update.dto.ts
├── entities/              # TypeORM entities
│   └── feature.entity.ts
└── interfaces/            # TypeScript interfaces (optional)
```

### Existing Modules
- **HealthModule**: Simple liveness/readiness probes (no dependencies)
- **AuthModule** (partial):
  - Custom decorators: `@CurrentUser()`, `@Public()`, `@Roles(Role.Admin)`
  - Guards: `jwtAuthGuard`, `rolesGuard`
  - Uses `@nestjs/jwt` with Ed25519 keys

### Database Layer
- **TypeORM** with async configuration via `ConfigService`
- **Entities**: Located in `entities/` subdirectories of feature modules
- **Migrations**: Generated via `pnpm run typeorm`
- **Connection**: Configured in `AppModule` with PostgreSQL
- **Synchronize**: Enabled in non-production (auto-updates schema)

### Authentication & Authorization
- **JWT** using Ed25519 algorithm (asymmetric)
- Access token: 15 minutes, Refresh token: 7 days
- Tokens verified via `JwtService.verifyAsync()`
- **RBAC** with `Role` enum (Admin, User, Moderator)
- Guards check public endpoints and roles
- Custom `@CurrentUser()` decorator extracts user from request

### Configuration Management
- **@nestjs/config** module (global)
- Environment variables from `.env` file
- Key variables (see `.env.example`):
  - `DATABASE_URL`: Full Postgres connection string (overrides individual settings)
  - `REDIS_URL`: Redis connection
  - `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`: Ed25519 key paths
  - `APP_PORT`: Server port (default: 3001)
  - `NODE_ENV`: Environment (production/development)

### API Design
- **RESTful** endpoints with Swagger documentation
- **Validation**: Global `ValidationPipe` (whitelist, transform, forbidNonWhitelisted)
- **DTOs**: Use `class-validator` decorators for request validation
- **Responses**: Standardized JSON with consistent status codes
- **API Docs**: Available at `/api/docs` (Swagger UI)
- **Versioning**: No version prefix yet (v1 planned)

### Error Handling
- Built-in NestJS exception filters
- Custom exceptions should extend `HttpException`
- Validation errors return 400 with details
- Authentication/authorization errors return 401/403

### Caching & Queues
- **Redis** for caching and BullMQ (planned for background jobs)
- Currently: Redis only used in health check
- BullMQ workers planned for payouts, notifications (Sprint 4)

---

## 🔐 Security Practices

- **JWT**: Ed25519 asymmetric keys (private key never shared)
- **Rate Limiting**: Planned for login (5/15min) and global (120/min)
- **Helmet**: Security headers middleware (to be added)
- **CORS**: Configured for production domains (to be added)
- **Input Validation**: Strict DTO validation with `class-validator`
- **SQL Injection**: Prevented by TypeORM parameterized queries
- **Secrets**: Never commit `.env` or `keys/` directory

---

## 🧪 Testing Strategy

- **Framework**: Jest with ts-jest
- **Location**: `test/` directory mirrors `src/` structure
- **Types**: Unit tests for services, integration tests for controllers
- **Database**: Use TestContainers for isolated Postgres instances (planned)
- **Auth**: Mock JWT verification with test keys
- **Coverage**: Aim for 80%+ on critical modules

**Running Tests:**
```bash
# All tests
pnpm run test

# Single file
pnpm run test -- test/auth/decorators/current-user.decorator.spec.ts

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:cov
```

**Test Files:**
- Decorator tests in `test/auth/decorators/`
- Guard tests in `test/auth/guards/`
- Add tests alongside features as they're built

---

## 📝 Code Style & Conventions

### General
- **TypeScript**: Strict mode enabled (`strict: true` in tsconfig.json)
- **Naming**: PascalCase for classes, camelCase for variables/functions, kebab-case for files
- **Imports**: Group external → internal → relative, alphabetized within groups
- **Formatting**: Prettier (run `pnpm run format`)
- **Linting**: ESLint with `@typescript-eslint` (run `pnpm run lint`)

### NestJS Specific
- **Modules**: `XxxModule` (feature name + Module)
- **Controllers**: `XxxController.ts` (REST endpoints)
- **Services**: `XxxService.ts` (business logic, injected as providers)
- **DTOs**: `create-xxx.dto.ts`, `update-xxx.dto.ts` (in `dto/` subdirectory)
- **Entities**: `Xxx.entity.ts` (in `entities/` subdirectory)
- **Guards**: `xxx.guard.ts` (canActivate logic)
- **Decorators**: `xxx.decorator.ts` (custom metadata)

### Database
- **Entity fields**: snake_case for DB columns, camelCase for TypeScript properties
- Use TypeORM decorators: `@PrimaryGeneratedColumn()`, `@Column()`, `@CreateDateColumn()`, `@UpdateDateColumn()`
- Relations: `@ManyToOne()`, `@OneToMany()`, `@ManyToMany()` with proper `{ eager: true }` or lazy loading

### DTOs
- Use class-validator decorators: `@IsString()`, `@IsNumber()`, `@IsEmail()`, `@IsEnum()`, `@Validate()`, etc.
- Use class-transformer for transformation if needed
- Separate Create and Update DTOs (Update DTOs should have all fields optional with `@IsOptional()`)

### Error Handling
- Service layer: Throw `HttpException` with status & message
- Controller: Let NestJS handle exceptions (returns standardized JSON)
- Use built-in exceptions: `BadRequestException`, `NotFoundException`, `ForbiddenException`, `UnauthorizedException`

---

## 🔧 Configuration Files

- **`.eslintrc.json`**: ESLint rules (TypeScript ESLint plugin, recommended configs)
- **`.vscode/settings.json`**: VS Code workspace settings (ESLint CWD, TypeScript SDK)
- **`jest.config.js`**: Jest with ts-jest, coverage from `src/` and `test/`
- **`nest-cli.json`**: NestJS compiler options (deleteOutDir: true)
- **`tsconfig.json`**: TypeScript strict config (ES2021 target, commonjs module)
- **`docker-compose.yml`**: Local Postgres 16 + Redis 7 services
- **`.env.example`**: Template for all required environment variables

---

## ⚠️ Important Notes

### VS Code ESLint
- If you see parsing errors, ensure:
  1. You opened the `taktip-backend` folder (not the parent `T-One-Tech`)
  2. The `.vscode/settings.json` exists in the project root
  3. Run "Reload Window" (Cmd+Shift+P)
- ESLint uses `./tsconfig.json` relative path – DO NOT change to absolute path

### TypeScript & Dependency Versions
- TypeScript: 5.9.3
- `@typescript-eslint/*`: v8.x (compatible with TS 5.9+)
- **Never** downgrade ESLint parser; it breaks import parsing

### Docker Services
- Must be running before starting the app (`docker compose up -d`)
- Postgres: `localhost:5432`, database: `taktip_dev`, user: `taktip`
- Redis: `localhost:6379`

### JWT Keys
- **Never** commit the `keys/` directory
- Generate Ed25519 keypair using the provided command
- In production, use environment variables or secret management (Infisical planned)

### Environment
- Development: `.env` file in project root
- Production: Use Infisical or similar secrets manager
- Required variables: See `.env.example`

### Database Migrations
- Run migrations before starting app in production
- Generate migrations after entity changes:
  ```bash
  pnpm run typeorm migration:generate -n MigrationName
  ```
- Review generated migrations carefully before committing

---

## 🐛 Debugging Tips

### Common Issues

1. **ESLint Parsing Error**
   - Cause: Wrong working directory or outdated ESLint
   - Fix: Close/reopen project folder; run `pnpm install` to update deps

2. **Database Connection Failed**
   - Check: Is Docker running? `docker compose ps`
   - Verify `.env` has correct `DATABASE_URL` or individual DB settings
   - Ensure Postgres container is healthy

3. **JWT Errors**
   - Check: `keys/ed25519_private.pem` and `keys/ed25519_public.pem` exist
   - Verify paths in `.env` are correct
   - Ensure keys are in PEM format

4. **Port Already in Use**
   - Change `APP_PORT` in `.env`
   - Or kill process: `lsof -i :3001` then `kill -9 <PID>`

5. **Module Not Found**
   - Ensure `node_modules/` exists and dependencies installed
   - Run `pnpm install` if you see module errors
   - Clear cache: `pnpm store prune` then reinstall

### Logging
- Development: Console logs visible in terminal
- Production: Configure winston/pino logger (TODO)
- Database queries: Enabled in development (`logging: true`)

---

## 📚 API Documentation

Once server is running (`pnpm run start:dev`):

- **Swagger UI**: http://localhost:3001/api/docs
- **Health Check**: GET http://localhost:3001/health (returns service health)
- **Liveness**: GET http://localhost:3001/health/live
- **Readiness**: GET http://localhost:3001/health/ready

**Authentication Endpoints (Sprint 2 - To Be Implemented):**
- `POST /auth/register/merchant` - Merchant registration
- `POST /auth/register/staff` - Staff invite acceptance
- `POST /auth/login` - Unified login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Revoke refresh token

---

## 🎯 Development Workflow

1. **Create feature branch**: `git checkout -b feature/FEATURE-NAME`
2. **Implement module**:
   - Create `feature/` directory with module, controller, service, DTOs, entities
   - Register in `app.module.ts` or parent module
   - Add routes with Swagger decorators (`@ApiTags`, `@ApiOperation`, etc.)
3. **Write tests** in `test/feature/` mirroring structure
4. **Run tests**: `pnpm run test`
5. **Lint**: `pnpm run lint -- --fix`
6. **Type check**: `pnpm run typecheck`
7. **Commit**: `git commit -m 'feat(feature): description'`
8. **Push & PR**: Push branch, open PR, request review
9. **Address feedback**: Run `./scripts/check-pr-review.sh` to check PR status

---

## 🔮 Upcoming Work (Roadmap)

- **Sprint 1** (Current): Foundation – Docker, TypeORM, Health, Auth scaffolding
- **Sprint 2**: Authentication – JWT implementation, login/register
- **Sprint 3**: Core Tipping – Guest tipping flow (QR → Paystack)
- **Sprint 4**: Staff Portal – Dashboard, shifts, wallet
- **Sprint 5**: Merchant Portal – Analytics, roster, payouts
- **Sprint 6**: Admin Console – KYC, audit logs
- **Sprint 7**: Background Jobs – BullMQ workers
- **Sprint 8**: Notifications – Email/push
- **Sprint 9-10**: Production readiness – CI/CD, testing, security hardenin

---

## 📞 Support & Questions

- **Documentation**: See `README.md` for setup and architecture details
- **Code Style**: Follow existing patterns; use `CurrentUser`, `@Public()`, `@Roles()` decorators
- **Dependencies**: Before adding new packages, check if already in `package.json`
- **Database**: Use TypeORM repository pattern; avoid raw queries unless necessary
- **Testing**: Aim for high coverage on business logic; mock external services

---

*Built with ❤️ by the T-One Technologies Team*
