# TakTip E2E Testing Workflow

> **Last updated:** 2026-05-25  
> **Target branch:** `develop` → `staging`  
> **Prerequisites:** PostgreSQL, Redis, Node.js (or Docker), Paystack test keys

---

## Table of Contents

1. [What We Can Test Right Now (Without External Services)](#1-what-we-can-test-right-now)
2. [What Requires External Services](#2-what-requires-external-services)
3. [Full E2E Flow — Step by Step](#3-full-e2e-flow)
4. [Setup Guide](#4-setup-guide)
5. [Docker Setup (Infra Only)](#5-docker-setup-infra-only--postgres--redis)
6. [Ngrok + Paystack Webhook Setup](#6-ngrok--paystack-webhook-setup)
7. [Automated E2E Shell Script (Recommended)](#7-automated-e2e-shell-script-recommended)
8. [Postman Collection Runner (Manual)](#8-postman-collection-runner-manual)
9. [Newman CI Integration](#9-newman-ci-integration)
10. [Troubleshooting](#10-troubleshooting)
11. [Postman Environment Quick Reference](#11-postman-environment-quick-reference)

---

## 1. What We Can Test Right Now

### ✅ Testable Without External Dependencies

| Feature | Endpoints | Auth Required | Notes |
|---------|-----------|---------------|-------|
| **Merchant Registration** | `POST /api/v1/auth/register/merchant` | No | Creates user, sends OTP |
| **OTP Verification** | `POST /api/v1/auth/verify-otp` | No | OTP printed to server logs |
| **Login** | `POST /api/v1/auth/login` | No | Returns JWT access + refresh tokens |
| **Staff Registration** | `POST /api/v1/auth/register/staff` | Yes (merchant) | Creates staff member |
| **Dashboard** | `GET /api/v1/staff/dashboard` | Yes (staff) | Returns profile + wallet |
| **Payout Method** | `PATCH /api/v1/staff/settings/payout-method` | Yes (staff) | Sets bank details |
| **Wallet Creation** | `POST /api/v1/staff/wallet` | Yes (staff) | Creates staff wallet |
| **Wallet Balance** | `GET /api/v1/staff/wallet` | Yes (staff) | Returns 4-bucket balance |
| **QR Code Generation** | `POST /api/v1/merchant/qrcodes` | Yes (merchant) | Generates QR with short code |
| **QR Code List** | `GET /api/v1/merchant/qrcodes` | Yes (merchant) | Lists merchant's QR codes |
| **QR Code Deactivate** | `DELETE /api/v1/merchant/qrcodes/:id` | Yes (merchant) | Soft-deactivates |
| **QR Code Resolve** | `GET /api/v1/tip/:shortCode` | No (public) | Resolves to merchant/staff |
| **Guest Tip Initiate** | `POST /api/v1/guest/tip` | No (public) | Creates Tip + Payment, returns Paystack URL |
| **Staff Tips List** | `GET /api/v1/staff/tips` | Yes (staff) | Paginated tip history |
| **Staff Earnings** | `GET /api/v1/staff/tips/earnings` | Yes (staff) | Aggregated totals, date-filterable |
| **Merchant Tips List** | `GET /api/v1/merchant/tips` | Yes (merchant) | Enriched with staff names |
| **Staff Tips by Merchant** | `GET /api/v1/merchant/staff/:id/tips` | Yes (merchant) | Drill into one staff member |
| **Request Payout** | `POST /api/v1/staff/payouts` | Yes (staff) | Atomic debit, creates PENDING |
| **List My Payouts** | `GET /api/v1/staff/payouts` | Yes (staff) | Staff's payout history |
| **List All Payouts** | `GET /api/v1/admin/payouts` | Yes (admin) | Filterable by status |
| **Approve Payout** | `PATCH /api/v1/admin/payouts/:id/approve` | Yes (admin) | Enqueues BullMQ job |
| **Reject Payout** | `PATCH /api/v1/admin/payouts/:id/reject` | Yes (admin) | Reverses wallet balances |
| **Payout Processing** | (BullMQ worker) | Internal | Auto-processes APPROVED → COMPLETED |

> **Total: 22 endpoints testable immediately**

### ⏳ Requires External Services

| Feature | Endpoints | What's Missing | Workaround |
|---------|-----------|---------------|------------|
| **Real Paystack Payment** | (via Paystack checkout URL) | User must open URL in browser, enter test card | Use Paystack test card `4084 0840 8408 4081` |
| **Webhook (charge.success)** | `POST /api/v1/payments/webhook` | Paystack must send it; needs signature | Use `ngrok` + Paystack dashboard webhook config |
| **Wallet Credit** | (auto via webhook) | Only happens after real webhook | Manual DB update to simulate |
| **Admin Role Access** | admin/payouts/* | Merchant is not ADMIN by default | Update role in DB: `UPDATE users SET role = 4 WHERE email = 'merchant@test.com'` |

---

## 2. What Requires External Services

### Paystack Test Cards
These work in the Paystack test checkout environment:

| Card Number | Type | Description |
|------------|------|-------------|
| `4084 0840 8408 4081` | Visa | Successful transaction |
| `5060 6600 0000 0000` | Verve | Successful transaction |
| `4000 0000 0000 0000` | Visa | Successful transaction |
| `4000 0000 0000 0002` | Visa | Failed transaction |

Any future expiry date, any 3-digit CVV works for test mode.

### Redis (Required for BullMQ)

**Docker:** Redis is included in `docker-compose.yml` — starts automatically.

**Native:**
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running:
brew services start redis

# Verify queue is working (after approving a payout):
redis-cli llen bull:payouts:wait
```

### Admin Role
The payout admin endpoints require `ADMIN` role (value `4`). To grant it:

```bash
# Connect to the Docker Postgres
docker compose exec postgres psql -U taktip -d taktip_dev
```

```sql
UPDATE users SET role = 4 WHERE email = 'merchant@test.com';
```

Or revert:
```sql
UPDATE users SET role = 2 WHERE email = 'merchant@test.com';
```

---

## 3. Full E2E Flow

### Phase 1: Auth Setup — Merchant

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/auth/register/merchant                    │
│  { email, password, businessName, phone }               │
├─────────────────────────────────────────────────────────┤
│  ↓ OTP sent (check terminal logs)                      │
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/auth/verify-otp                          │
│  { email, otp } → "Email verified"                     │
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/auth/login                               │
│  { email, password } → { accessToken, refreshToken }   │
└─────────────────────────────────────────────────────────┘
```

### Phase 2: Staff Setup

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/auth/register/staff (Bearer: merchant)    │
│  { email, password, firstName, displayName, roleTag }   │
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/auth/verify-otp (staff email)             │
│  { email: staff@..., otp }                             │
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/auth/login (as staff)                    │
│  { email: staff@..., password } → staff_token          │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/staff/dashboard (Bearer: staff)            │
│  → Capture staff_profile_id from response              │
├─────────────────────────────────────────────────────────┤
│  PATCH /api/v1/staff/settings/payout-method             │
│  { accountNumber, bankCode, bankName, accountHolderName}│
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/staff/wallet                              │
│  {} → Creates staff wallet (idempotent)                │
└─────────────────────────────────────────────────────────┘
```

### Phase 3: QR Codes

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/merchant/qrcodes (Bearer: merchant)       │
│  {} → { qrCode: { id, shortCode, url }, qrDataUrl }    │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/merchant/qrcodes → list all                │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/tip/{shortCode} (public, no auth)          │
│  → { merchantId, staffProfileId? }                     │
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Guest Tip (External Payment Required)

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/guest/tip (public, no auth)               │
│  { qrCodeId, amount, message?, email? }                 │
│  → { authorizationUrl, reference }                      │
├─────────────────────────────────────────────────────────┤
│  ┌─ User opens authorizationUrl in browser ──────────┐  │
│  │ Enters Paystack test card "4084 0840 8408 4081"   │  │
│  │ Completes payment → Paystack sends webhook        │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Paystack → POST /api/v1/payments/webhook               │
│  (Requires ngrok + Paystack dashboard config)           │
│  → Updates Payment: PENDING → SUCCESS                  │
│  → Updates Tip: PENDING → COMPLETED                    │
│  → Credits wallet balance_pending (atomic SQL)         │
└─────────────────────────────────────────────────────────┘
```

### Phase 5: Tips & Earnings

```
┌─────────────────────────────────────────────────────────┐
│  GET /api/v1/staff/tips?page=1&limit=20                 │
│  → { tips: [...], total }                              │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/staff/tips/earnings?startDate=&endDate=    │
│  → { totalAmount, tipCount }                           │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/merchant/tips?page=1&limit=20              │
│  → { tips: [{ staffName, amount, ... }], total }       │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/merchant/staff/{profileId}/tips            │
│  → Staff-specific tips for merchant view               │
└─────────────────────────────────────────────────────────┘
```

### Phase 6: Payouts

```
┌─────────────────────────────────────────────────────────┐
│  GET /api/v1/staff/wallet → check available balance     │
├─────────────────────────────────────────────────────────┤
│  POST /api/v1/staff/payouts (Bearer: staff)             │
│  { amount: 2000 }                                      │
│  → Debits balance_available → credits balance_processing│
│  → Creates PENDING payout record                       │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/admin/payouts?status=1 (Bearer: admin)     │
│  → Lists all PENDING payouts                           │
├─────────────────────────────────────────────────────────┤
│  ┌─ Admin reviews ─────────────────────────────────┐    │
│  ├── PATCH /api/v1/admin/payouts/:id/approve       │    │
│  │   → Status: APPROVED, enqueues BullMQ job       │    │
│  ├── PATCH /api/v1/admin/payouts/:id/reject        │    │
│  │   → Status: REJECTED, reverses wallet balances   │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  (BullMQ worker processes APPROVED payout)              │
│  → Debits balance_processing → Status: COMPLETED        │
├─────────────────────────────────────────────────────────┤
│  GET /api/v1/admin/payouts?status=4                     │
│  → Verify payout is COMPLETED                          │
└─────────────────────────────────────────────────────────┘
```

### Full Data Flow Diagram

```
Guest                     Tip/Payment               Wallet
 │                          │                         │
 ├─ Scan QR ────────────────┤                         │
 │                          │                         │
 ├─ POST /guest/tip ───────►│                         │
 │                          ├─ Create Tip (PENDING)   │
 │                          ├─ Create Payment(PENDING)│
 │◄── Paystack URL ─────────┤                         │
 │                          │                         │
 ├─ [Browser] Paystack ─────┤                         │
 │   Checkout               │                         │
 │                          │                         │
 │        Paystack ─────────┤                         │
 │        Webhook           ├─ Payment → SUCCESS      │
 │                          ├─ Tip → COMPLETED        │
 │                          ├────────────────────────►│
 │                          │    UPDATE wallets        │
 │                          │    SET balance_pending   │
 │                          │    += amount             │
 │                          │                         │
Staff                     Payout                    Admin
 │                          │                         │
 ├─ POST /staff/payouts ───►│                         │
 │   { amount }             ├─ Debit balance_available│
 │                          ├─ Credit bal_processing  │
 │                          ├─ Create Payout (PENDING)│
 │                          │                         │
 │                          │    GET /admin/payouts ◄─┤
 │                          │                         ├─ Review
 │                          │                         │
 │                          │   PATCH /approve ◄──────┤
 │                          │   Status: APPROVED      │
 │                          │   Enqueue BullMQ        │
 │                          │                         │
 │                          ├─ (Worker)               │
 │                          ├─ Debit bal_processing   │
 │                          ├─ Status: COMPLETED      │
 │                          │                         │
 │◄── status: COMPLETED ────┤                         │
```

---

## 4. Setup Guide

### 4.1 Start Infrastructure (Docker)

PostgreSQL and Redis run in Docker. The app runs natively.

```bash
# Start Postgres + Redis containers
docker compose up -d

# Verify both are healthy
docker compose ps
```

### 4.2 Start the App (Native)

```bash
# Install dependencies
pnpm install

# Create .env if not present
cp -n .env.example .env
# ⚠️ Edit .env with your PAYSTACK_SECRET_KEY, etc.

# Run migrations (creates tables)
pnpm run migration:run

# Start in dev mode (hot-reload)
pnpm run start:dev

# Swagger: http://localhost:3001/swagger/v1/docs
```

### 4.3 Import Postman Collection

```bash
1. Open Postman
2. File → Import
3. Select docs/TakTip-E2E-Collection.json
4. Also import docs/TakTip-Local-Environment.json
5. Select the TakTip Local environment from the dropdown
6. Start testing!
```

### 4.2 Database Setup

```bash
# Option A: Auto-sync (development — synchronize: true in .env for NODE_ENV != production)
pnpm run start:dev

# Option B: Migrations (staging/production — synchronize: false)
pnpm run migration:run
```

### 4.3 Start the Server

```bash
# Development (watch mode)
pnpm run start:dev

# The server starts on http://localhost:3001
# Swagger: http://localhost:3001/swagger/v1/docs
```

### 4.4 Import Postman Collection

1. Open Postman
2. **File → Import**
3. Select `docs/TakTip-E2E-Collection.json`
4. Also import `docs/TakTip-Local-Environment.json`
5. Select the **TakTip Local** environment from the dropdown
6. Start testing!

---

## 5. Docker Setup (Infra Only — Postgres + Redis)

Only PostgreSQL and Redis run in Docker. The NestJS app runs natively on your host.
This is the **recommended** setup — you get containerized infra without losing
hot-reload speed or debugger access.

### 5.1 Quick Start

```bash
# 1. Start Postgres and Redis
docker compose up -d

# 2. Verify they're healthy
docker compose ps

# 3. Install deps and start the app (natively)
pnpm install
pnpm run start:dev

# 4. Run migrations (creates tables)
pnpm run migration:run

# 5. Swagger is at http://localhost:3001/swagger/v1/docs
```

### 5.2 Services Overview

| Service | Container Name | Port | Connection String (from host app) |
|---------|---------------|------|-----------------------------------|
| PostgreSQL | `taktip-db` | `5432` | `postgresql://taktip:devpassword@localhost:5432/taktip_dev` |
| Redis | `taktip-redis` | `6379` | `redis://localhost:6379` |

### 5.3 Access the Database Directly

```bash
# Via psql (runs on host, connects to container on localhost:5432)
psql -h localhost -U taktip -d taktip_dev

# Via docker exec
docker compose exec postgres psql -U taktip -d taktip_dev
```

### 5.4 Access Redis Directly

```bash
# Via redis-cli on host
redis-cli ping

# Via docker exec
docker compose exec redis redis-cli

# Check BullMQ payout queue
LLEN bull:payouts:wait
```

### 5.5 View Logs

```bash
# Both services
docker compose logs -f

# Specific service
docker compose logs -f postgres
docker compose logs -f redis
```

### 5.6 Stop / Clean Up

```bash
# Stop containers (data persists in named volumes)
docker compose down

# Stop + delete volumes (wipes all data)
docker compose down -v
```

### 5.7 Postman with Docker

No changes needed. The app runs natively on `localhost:3001`, Postgres is on `localhost:5432`,
Redis is on `localhost:6379`. Postman's `base_url` stays `http://localhost:3001/api/v1`.

If you run Newman in CI, also no changes — everything resolves on `localhost`.

---

## 6. Ngrok + Paystack Webhook Setup

This is the **critical path** for testing real wallet credit. Without it, the guest tip flow stops at the Paystack checkout URL.

### Step 1: Install ngrok

```bash
brew install ngrok
# Or download from https://ngrok.com/download

# Authenticate (free tier — get token from ngrok dashboard)
ngrok config add-authtoken YOUR_NGROK_AUTH_TOKEN
```

### Step 2: Start ngrok

```bash
# The app is available at localhost:3001 whether running natively OR in Docker
# (docker-compose maps host:3001 → container:3001)
ngrok http 3001
```

Output:
```
Forwarding  https://abc123.ngrok-free.app → http://localhost:3001
```

### Step 3: Configure Paystack Webhook

1. Log in to [Paystack Dashboard](https://dashboard.paystack.com)
2. Go to **Settings → Webhooks**
3. Add webhook URL:
   ```
   https://abc123.ngrok-free.app/api/v1/payments/webhook
   ```
4. Enable events: `charge.success`, `charge.failed`
5. **No separate webhook secret needed** — Paystack signs webhooks using your **API Secret Key** (`PAYSTACK_SECRET_KEY`). It is already configured in `.env`.
   > See: https://paystack.com/docs/payments/webhooks/#verify-event-origin-with-signature-validation

### Step 4: Test the Full Payment Flow

```bash
# Terminal 1: Backend server
pnpm run start:dev

# Terminal 2: ngrok
ngrok http 3001
```

1. Generate QR code (merchant token)
2. Initiate guest tip via `POST /api/v1/guest/tip`
3. Open the returned `authorizationUrl` in a browser
4. Enter Paystack test card: `4084 0840 8408 4081`
5. Any future expiry date, any CVV
6. Complete payment
7. Paystack sends webhook → backend processes:
   - Payment: PENDING → SUCCESS
   - Tip: PENDING → COMPLETED
   - Wallet: `balance_pending` credited atomically

### Step 5: Verify Results

```bash
# Check wallet balance
curl -H "Authorization: Bearer $(STAFF_TOKEN)" \
  http://localhost:3001/api/v1/staff/wallet

# Check tips
curl -H "Authorization: Bearer $(STAFF_TOKEN)" \
  http://localhost:3001/api/v1/staff/tips

# Check payment record
curl http://localhost:3001/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: VALID_HMAC" \
  -d '{"event":"charge.success","data":{"reference":"TXT-..."}}'
```

### Step 6: Troubleshooting Webhooks

```bash
# Check server logs (webhook signature verification)
# Check Paystack dashboard → Webhooks → Logs
# Check ngrok dashboard: http://localhost:4040

# Common issues:
# - PAYSTACK_SECRET_KEY mismatch → "signature verification failed"
# - Ngrok URL changed → update Paystack dashboard
# - Reference not found → Payment already processed or wrong reference
```

---

## 7. Automated E2E Shell Script (Recommended)

For a **truly one-click E2E** that handles OTP auto-capture, token chaining, and webhook simulation:

### How It Works

```bash
# Terminal 1 — infra
cd taktip-backend && docker compose up -d

# Terminal 2 — start the script
./scripts/e2e-automated.sh
```

The script:
1. Starts the app in background, piping logs to `/tmp/taktip-e2e-*.log`
2. Watches the log for `[DEV] OTP` lines → auto-extracts OTP codes
3. Runs **all 22+ curl requests** in flow order, chaining tokens and IDs
4. Generates a real HMAC-SHA256 signature for the webhook simulation
5. Promotes merchant to ADMIN role via direct SQL, then resets it
6. Prints a pass/fail summary at the end

### Run It

```bash
# Make sure infra is up
docker compose up -d

# Run the automated E2E (app auto-starts)
./scripts/e2e-automated.sh

# Or if the app is already running separately:
./scripts/e2e-automated.sh    # detects running app and skips startup
```

### What It Tests

| # | Section | Endpoints | Auto-Chained? |
|---|---------|-----------|:---:|
| 1 | Auth Setup (Merchant) | Register, OTP verify, Login | ✅ OTP from logs |
| 2 | Staff Setup | Create, Login, Dashboard, Wallet, Payout Method | ✅ tokens auto-set |
| 3 | QR Codes | Generate (generic + staff), List, Resolve | ✅ IDs auto-set |
| 4 | Guest Tip | Initiate tip, Simulate Paystack webhook | ✅ HMAC generated |
| 5 | Tips & Earnings | Staff tips, Earnings, Merchant tips, Staff drill | ✅ |
| 6 | Payouts | Check balance, Request, List, Admin approve, Verify | ✅ BullMQ waited |
| 7 | Cleanup | Reject pending, Reset merchant role | ✅ SQL via Docker |

### File Location

```
scripts/e2e-automated.sh
```

## 8. Postman Collection Runner (Manual)

> **⚠️ Limitation:** Postman cannot auto-capture OTP codes from server logs.  
> Steps **A2** and **B2** (OTP verification) require you to read the OTP from the terminal and paste it into the `otp_code` environment variable. This makes the Collection Runner **semi-automated** — you must intervene for OTP steps.

### Best Practice: Hybrid Approach

| Phase | How to Run | Why |
|-------|-----------|-----|
| **Auth (01 + 02 steps)** | Manually, request by request | OTP codes need copy-paste |
| **QR → Guest Tip → Tips → Payouts → Cleanup** (03–07) | Collection Runner | Variables are auto-chained |

### To Run Folders 03–07 in the Runner

1. First, manually run **01** and **02** (until all tokens + profile/wallet IDs are set)
2. Verify env vars are populated: `merchant_token`, `staff_token`, `staff_profile_id`, `staff_wallet_id`
3. Open the collection → **Run**
4. Uncheck folders **01** and **02**
5. Keep **03 → 04 → 05 → 06 → 07** checked
6. Hit **Run**

The test scripts will auto-chain the remaining variables (`qr_code_id`, `payment_reference`, `payout_id`, etc.)

### Run Order

```
03 - QR Codes (Merchant)
04 - Guest Tip & Payment
05 - Tips & Earnings
06 - Payouts (Staff Request → Admin Approve)
07 - Cleanup (Reject Remaining Pending)
```

### What to Watch For

| Step | Expected | Troubleshoot |
|------|----------|-------------|
| A1. Register | `"status": "success"` | Check DB: `User` table created? |
| A2. Verify OTP | `"message": "...verified..."` | Find OTP in terminal logs |
| A3. Login | `accessToken` set | Check `merchant_token` env var |
| B4. Dashboard | `staff_profile_id` captured | Verify staff exists in DB |
| C1. QR Code | `qr_code_id` set | Check `short_code` is 8 hex chars |
| D1. Guest Tip | `paystack_authorization_url` | Open URL in browser for real test |
| F2. Request Payout | `payout_id` set | Verify wallet has enough balance |
| F5. Approve Payout | Status `APPROVED` | Redis must be running |
| F6. Verify | Status `COMPLETED` | BullMQ processes within seconds |

---

## 9. Newman CI Integration

For automated testing in CI/CD pipelines:

### Install Newman

```bash
npm install -g newman
```

### Run with Newman

```bash
# Basic run
newman run docs/TakTip-E2E-Collection.json \
  -e docs/TakTip-Local-Environment.json \
  --reporters cli,junit \
  --reporter-junit-export test-results/junit.xml

# With timeout and delay
newman run docs/TakTip-E2E-Collection.json \
  -e docs/TakTip-Local-Environment.json \
  --timeout-request 10000 \
  --delay-request 200

# Skip folders that require external services
newman run docs/TakTip-E2E-Collection.json \
  -e docs/TakTip-Local-Environment.json \
  --folder "01 - Auth Setup (Merchant)" \
  --folder "02 - Staff Setup" \
  --folder "03 - QR Codes (Merchant)" \
  --folder "05 - Tips & Earnings"
```

### GitHub Actions Integration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  pull_request:
    branches: [staging]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: taktip
          POSTGRES_PASSWORD: devpassword
          POSTGRES_DB: taktip_dev
        ports: [5432:5432]
      redis:
        image: redis:7
        ports: [6379:6379]

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2

      - run: pnpm install
      - run: pnpm run start:dev &
      - run: npx wait-on http://localhost:3001/health

      - name: Run E2E tests
        run: |
          npx newman run docs/TakTip-E2E-Collection.json \
            -e docs/TakTip-Local-Environment.json \
            --reporters cli,junit \
            --reporter-junit-export test-results/e2e.xml

      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: E2E Tests
          path: test-results/e2e.xml
          reporter: java-junit
```

---

## 10. Troubleshooting

### Auth Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | No token or expired | Login again, update env var |
| `403 Forbidden` | Wrong role for endpoint | Check if using staff token for merchant endpoint |
| OTP not working | Expired OTP (>15 min) | Resend OTP via `POST /resend-otp` |

### Wallet Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Insufficient wallet balance` | `balanceAvailable` < amount | Process a guest tip to add funds |
| Wallet not found | Wallet not created yet | `POST /api/v1/staff/wallet` first |
| `balance_pending` not credited | Webhook not processed | Check webhook setup, verify Paystack test |

### Payout Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No payout method configured` | Staff hasn't set bank details | `PATCH /staff/settings/payout-method` |
| `Cannot approve payout in status X` | Already approved or rejected | Only PENDING payouts can be approved |
| Payout stays PENDING after approve | Redis not running | Start Redis, retry |
| BullMQ job fails | Redis or worker issue | Check `redis-cli ping`, server logs |

### Swagger-Specific

| Symptom | Cause | Fix |
|---------|-------|-----|
| No endpoints visible | Wrong Swagger URL | Use `/swagger/v1/docs` |
| Authorize button not working | Token missing "Bearer " prefix | Format: `Bearer eyJhbGci...` |
| Response shows HTML | Server not running | `pnpm run start:dev` |

---

## 11. Postman Environment Quick Reference

### Variables Set Manually

| Variable | Where to Find It |
|----------|-----------------|
| `otp_code` | Terminal logs after register (6 digits) |
| `staff_otp_code` | Terminal logs after staff register |
| `merchant_token` | Set automatically by login test script |
| `staff_token` | Set automatically by login test script |

### Variables Set Automatically (via Test Scripts)

| Variable | Set By | Value |
|----------|--------|-------|
| `merchant_user_id` | A3. Login | `user.sub` UUID |
| `staff_user_id` | B3. Login Staff | `user.sub` UUID |
| `staff_profile_id` | B4. Dashboard | `profile.id` UUID |
| `staff_wallet_id` | B6. Create Wallet | `data.id` UUID |
| `qr_code_id` | C1. Generate QR | `data.qrCode.id` UUID |
| `short_code` | C1. Generate QR | `data.qrCode.shortCode` (8 hex chars) |
| `payment_reference` | D1. Guest Tip | `data.reference` (TXT-...) |
| `paystack_authorization_url` | D1. Guest Tip | `data.authorizationUrl` |
| `payout_id` | F2. Request Payout | `data.id` UUID |
| `payout_reference` | F2. Request Payout | `data.reference` (POUT-...) |

### Environment Variables Required in `.env`

```
DATABASE_URL=postgresql://taktip:devpassword@localhost:5432/taktip_dev
REDIS_URL=redis://localhost:6379
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
# Webhook HMAC uses PAYSTACK_SECRET_KEY (no separate webhook secret)
APP_URL=http://localhost:3001
```

---

## Appendix: Endpoint Cheat Sheet

```text
# === AUTH ===
POST /api/v1/auth/register/merchant     # Create merchant account
POST /api/v1/auth/register/staff        # Create staff (merchant token)
POST /api/v1/auth/verify-otp            # Verify email
POST /api/v1/auth/resend-otp            # Resend OTP
POST /api/v1/auth/login                 # Get JWT tokens
POST /api/v1/auth/refresh               # Refresh access token
POST /api/v1/auth/logout                # Revoke refresh token
POST /api/v1/auth/forgot-password       # Request password reset
POST /api/v1/auth/reset-password        # Reset password with token

# === STAFF ===
GET  /api/v1/staff/dashboard            # Get staff home data
GET  /api/v1/staff/profiles             # List staff profiles
GET  /api/v1/staff/settings             # Get settings
PATCH /api/v1/staff/settings            # Update settings
PATCH /api/v1/staff/settings/payout-method  # Set bank details

# === WALLET ===
POST  /api/v1/staff/wallet              # Create staff wallet
GET   /api/v1/staff/wallet              # Get staff wallet
GET   /api/v1/staff/wallet/:id/transactions  # Wallet transactions

# === MERCHANT ===
GET  /api/v1/merchant/me                # Get my merchant
GET  /api/v1/merchant/:id               # Get merchant by ID
GET  /api/v1/merchant/shortCode/:code   # Resolve short code
GET  /api/v1/merchant/:id/summary       # Merchant summary
GET  /api/v1/merchant/:id/staff         # List merchant staff
POST /api/v1/merchant/:id/invite        # Invite staff

# === QR CODES ===
POST   /api/v1/merchant/qrcodes         # Generate QR code
GET    /api/v1/merchant/qrcodes          # List QR codes
DELETE /api/v1/merchant/qrcodes/:id      # Deactivate QR code
GET    /api/v1/tip/:shortCode            # Resolve QR (public)

# === GUEST TIP (Public) ===
POST /api/v1/guest/tip                  # Initiate tip checkout
POST /api/v1/payments/webhook           # Paystack webhook

# === TIPS ===
GET /api/v1/staff/tips                  # Staff: my tips (paginated)
GET /api/v1/staff/tips/earnings         # Staff: earnings summary
GET /api/v1/merchant/tips               # Merchant: all tips with staff names
GET /api/v1/merchant/staff/:id/tips     # Merchant: tips by staff member

# === PAYOUTS ===
POST  /api/v1/staff/payouts             # Staff: request payout
GET   /api/v1/staff/payouts             # Staff: my payouts
GET   /api/v1/admin/payouts             # Admin: all payouts (?status=N)
PATCH /api/v1/admin/payouts/:id/approve # Admin: approve
PATCH /api/v1/admin/payouts/:id/reject  # Admin: reject
```
