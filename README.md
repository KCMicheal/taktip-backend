# TakTip Backend

> **TakTip** — A modern digital tipping and gratuity management SaaS platform for service businesses. Built with NestJS, TypeScript, and PostgreSQL.

![NestJS](https://img.shields.io/badge/NestJS-10.0-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Node](https://img.shields.io/badge/Node-20-brightgreen)

---

## 🏢 Company Overview

**TakTip** is a comprehensive digital tipping platform designed for:

- **Restaurants & Hospitality**: Hotels, cafes, and fine dining establishments
- **Personal Services**: Salons, barbershops, spas, and nail technicians
- **Healthcare**: Home care providers, medical assistants, and nursing staff
- **Delivery & Logistics**: Food delivery riders and logistics personnel

Our platform enables guests to tip staff members via QR codes, tracks earnings in real-time, manages shift schedules, and facilitates seamless payouts through integrated payment gateways.

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20 LTS |
| **Framework** | NestJS 10 |
| **Language** | TypeScript 5 (Strict Mode) |
| **Database** | PostgreSQL 16 |
| **Cache/Queue** | Redis 7, BullMQ |
| **Payment** | Paystack, Stripe |
| **ORM** | TypeORM 0.3 |
| **API Docs** | Swagger/OpenAPI 3.1 |
| **Testing** | Jest, TestContainers |
| **Containerization** | Docker Compose |

---

## ⚡ Quick Start

### Prerequisites

- macOS, Linux, or Windows (with WSL2)
- Docker Desktop
- Node.js 20 LTS (or use our setup script)

### Automated Setup (Recommended)

Run the setup script to install all dependencies automatically:

```bash
# Navigate to project directory
cd taktip-backend

# Run the setup script
./setup.sh

# Start development server
pnpm run start:dev
```

### Manual Setup

#### 1. Install Node.js 20

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or download directly
curl -L https://nodejs.org/dist/v20.12.0/node-v20.12.0-darwin-x64.tar.gz | tar xz
```

#### 2. Install pnpm

```bash
npm install -g pnpm
```

#### 3. Install Dependencies

```bash
pnpm install
```

#### 4. Generate JWT Keys

```bash
mkdir -p keys
node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
fs.writeFileSync('keys/ed25519_private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync('keys/ed25519_public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
console.log('✅ Ed25519 keys generated!');
"
```

#### 5. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

#### 6. Start Docker Services

```bash
docker compose up -d
```

#### 7. Start Development Server

```bash
pnpm run start:dev
```

---

## 🔐 Secrets Management

### Development Environment

For local development, secrets are managed via the `.env` file. **Never commit this file to version control.**

### Production Environment

We recommend using **Infisical** for production secrets management:

- ✅ **Now (MVP Phase)**: Use `.env` files with Docker Compose for simplicity
- ✅ **Later (Production Phase)**: Integrate Infisical CLI for:
  - Secrets synchronization across environments
  - Team collaboration on sensitive credentials
  - Audit logs for secret access
  - Automatic secret rotation

**Infisical Integration Guide:**

```bash
# Install Infisical CLI
npm install -g @infisical/infisical-cli

# Login to your organization
infisical login

# Initialize secrets in your project
infisical init

# Pull secrets for local development
infisical secrets pull --env=development
```

---

## 📁 Project Structure

```
taktip-backend/
├── keys/                    # JWT Ed25519 keys (DO NOT COMMIT)
├── src/
│   ├── auth/               # Authentication module (JWT, OAuth)
│   ├── users/              # User management
│   ├── merchants/          # Merchant management
│   ├── staff/              # Staff management
│   ├── tipping/            # Guest tipping flow
│   ├── wallet/             # Wallet & ledger system
│   ├── payments/           # Payment gateway integrations
│   ├── notifications/      # Email & push notifications
│   ├── admin/              # Admin console
│   ├── common/             # Shared decorators, filters, pipes
│   ├── config/             # Configuration modules
│   ├── database/          # Migrations & seeds
│   └── main.ts            # Application bootstrap
├── test/                   # Integration tests
├── docker-compose.yml      # Local development services
├── .env.example            # Environment template
├── .env                    # Local environment (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## 🧪 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run start:dev` | Start development server with hot reload |
| `pnpm run start:prod` | Build and start production server |
| `pnpm run build` | Compile TypeScript to JavaScript |
| `pnpm run lint` | Run ESLint |
| `pnpm run test` | Run unit tests |
| `pnpm run test:e2e` | Run end-to-end tests |
| `pnpm run typeorm` | Run TypeORM CLI commands |

---

## 📚 API Documentation

Once the server is running, access the Swagger documentation at:

```
http://localhost:3001/api/docs
```

### Authentication Endpoints (Sprint 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register/merchant` | Merchant self-registration |
| POST | `/auth/register/staff` | Staff invite acceptance |
| POST | `/auth/login` | Unified login |
| POST | `/auth/refresh` | Token refresh |
| POST | `/auth/logout` | Logout & token revocation |

---

## 🔒 Security

This project follows enterprise security best practices:

- **JWT Authentication**: Ed25519 asymmetric keys for access tokens (15m expiry)
- **Refresh Tokens**: Opaque tokens with SHA-256 hash storage
- **Rate Limiting**: Login (5/15min), Global (120/min)
- **Input Validation**: class-validator with strict DTOs
- **Helmet**: Security headers middleware
- **CORS**: Configured for production domains

---

## 📊 Database Schema

Key tables for the MVP:

- `users` — Base user accounts
- `merchant_profiles` — Merchant-specific data
- `staff_profiles` — Staff-specific data
- `wallet_balances` — Current balances (4-bucket ledger)
- `wallet_transactions` — Transaction history
- `refresh_tokens` — Token storage with device fingerprinting
- `shifts` — Shift definitions
- `shift_staff` — Staff-shift assignments
- `tips` — Tip records
- `payouts` — Payout requests and status

---

## 🗺️ Roadmap

### Phase 1: Foundation (Sprints 1-2)
- [x] Project scaffolding with NestJS
- [x] Docker Compose setup (Postgres + Redis)
- [ ] TypeORM configuration & migrations
- [ ] Swagger/OpenAPI setup
- [ ] Global validation & exception handling
- [ ] Health check endpoint
- [ ] Authentication module (Ed25519 JWT)

### Phase 2: Core Tipping (Sprints 3-4)
- [ ] Guest tipping flow (QR → Paystack → Webhook)
- [ ] Real-time WebSocket notifications
- [ ] Staff dashboard & clock in/out
- [ ] Payout request system

### Phase 3: Merchant & Reports (Sprints 5-6)
- [ ] Merchant dashboard & analytics
- [ ] Staff roster management
- [ ] Shift scheduling
- [ ] Tip distribution engine
- [ ] CSV report exports

### Phase 4: Admin & Jobs (Sprints 7-8)
- [ ] Admin console & KYC approval
- [ ] BullMQ workers (payouts, notifications)
- [ ] Audit logging
- [ ] System health monitoring

### Phase 5: Launch (Sprints 9-10)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production deployment
- [ ] Load & security testing
- [ ] Beta merchant onboarding

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/FEATURE-NAME`
2. Commit changes: `git commit -m 'feat(scope): FEATURE-NAME implement feature'`
3. Push to branch: `git push origin feature/FEATURE-NAME`
4. Open a Pull Request

---

## 📄 License

Private & Confidential — T-One Technologies © 2026

---

## 🆘 Support

For technical support, please contact:
- **Email**: support@taktip.io
- **Documentation**: https://docs.taktip.io

---

*Built with ❤️ by the T-One Technologies Team*
