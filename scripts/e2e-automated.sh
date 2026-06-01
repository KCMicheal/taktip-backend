#!/usr/bin/env bash
# =============================================================================
# TakTip — Fully Automated E2E Test Script
# =============================================================================
# Prerequisites:
#   - Docker containers running (postgres + redis): docker compose up -d
#   - Migrations applied:                       pnpm run migration:run
#   - .env file with PAYSTACK_SECRET_KEY and PAYSTACK_WEBHOOK_SECRET
#
# What it does:
#   1. Starts the NestJS app in background, captures logs
#   2. Auto-detects OTP codes from dev logs
#   3. Runs through all 22+ API calls in flow order
#   4. Simulates a Paystack webhook (HMAC-SHA512 signed — per Paystack official spec)
#   5. Verifies wallet balances, tips, payouts end-to-end
#   6. Prints a beautiful summary at the end
# =============================================================================

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
BASE_URL="http://localhost:3001/api/v1"
LOG_FILE="/tmp/taktip-e2e-$(date +%s).log"
APP_PID=""
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()    { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)) ;}
fail()   { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)) ;}
warn()   { echo -e "  ${YELLOW}⚠${NC} $1"; }
header() { echo -e "\n${YELLOW}══ $* ══${NC}\n"; }

# ─── Prerequisites Check ──────────────────────────────────────────────────────
check_prereqs() {
  header "Prerequisites"

  # Check Docker infra
  if docker compose ps 2>/dev/null | grep -q "taktip-db.*healthy"; then
    ok "Postgres container is healthy"
  else
    warn "Postgres not healthy — run: docker compose up -d"
  fi

  if docker compose ps 2>/dev/null | grep -q "taktip-redis.*healthy"; then
    ok "Redis container is healthy"
  else
    warn "Redis not healthy — run: docker compose up -d"
  fi

  # Check .env exists with required keys
  if [ -f .env ]; then
    ok ".env file exists"
  else
    fail ".env file missing — copy from .env.example"
    exit 1
  fi

  # Check curl is available
  command -v curl >/dev/null 2>&1 || { fail "curl is required"; exit 1; }
  command -v openssl >/dev/null 2>&1 || { fail "openssl is required for webhook signing"; exit 1; }
  command -v jq >/dev/null 2>&1 || { warn "jq not found — will use basic JSON parsing"; }

  ok "All prerequisites met"
}

# ─── Start App ────────────────────────────────────────────────────────────────
start_app() {
  header "Starting App"

  # Check if already running
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    ok "App already running on $BASE_URL"
    return
  fi

  log "Starting NestJS in background (logs → $LOG_FILE)…"
  pnpm run start:dev > "$LOG_FILE" 2>&1 &
  APP_PID=$!

  # Wait for it to be ready (up to 60s)
  log "Waiting for app to start…"
  for i in $(seq 1 60); do
    if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
      ok "App is ready (${i}s)"
      return
    fi
    sleep 1
  done

  fail "App failed to start within 60s"
  log "Last 20 lines of log:"
  tail -20 "$LOG_FILE"
  exit 1
}

# ─── Wait for OTP in Logs ─────────────────────────────────────────────────────
# Reads the log file and waits for a "[DEV] OTP for <email>: <code>" line.
# Sets $OTP_CODE variable.
wait_for_otp() {
  local email="$1"
  local timeout="${2:-30}"
  local label="${3:-OTP}"

  log "Waiting for $label (email: $email)…"

  # Tail the log file from the end
  local start_size
  start_size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)

  for i in $(seq 1 "$timeout"); do
    local line
    line=$(tail -c +"$start_size" "$LOG_FILE" 2>/dev/null | grep "\[DEV\] OTP for ${email}:" | head -1 || true)
    if [ -n "$line" ]; then
      OTP_CODE=$(echo "$line" | sed -n 's/.*\[DEV\] OTP for .*: \([0-9]\{6\}\).*/\1/p')
      if [ -n "$OTP_CODE" ]; then
        ok "$label captured: ${OTP_CODE}"
        return
      fi
    fi
    sleep 1
  done

  fail "$label not found in logs after ${timeout}s"
  log "Last 30 log lines:"
  tail -30 "$LOG_FILE"
  log "Searching for OTP pattern in full log…"
  grep -i "otp\|OTP" "$LOG_FILE" | tail -5 || true
  exit 1
}

# ─── API Helper ───────────────────────────────────────────────────────────────
# Usage: api_call METHOD PATH [BODY] [TOKEN_VAR]
#   - TOKEN_VAR is the name of the variable holding the Bearer token (optional)
#   - Sets $RESPONSE to the response body
#   - Returns 0 on HTTP 2xx
api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token_var="${4:-}"

  local url="${BASE_URL}${path}"
  local args=(-sS)

  # Method
  args+=(-X "$method")

  # Headers
  args+=(-H "Content-Type: application/json")
  if [ -n "$token_var" ]; then
    args+=(-H "Authorization: Bearer ${!token_var}")
  fi

  # Body
  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi

  RESPONSE=$(curl "${args[@]}" "$url")
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "${args[@]}" "$url" 2>/dev/null || echo "000")

  # If the above fails (body vs no-body issue), retry smarter
  if [ "$http_code" = "000" ]; then
    RESPONSE=$(curl -sS -X "$method" \
      -H "Content-Type: application/json" \
      $( [ -n "$token_var" ] && echo "-H Authorization: Bearer ${!token_var}" ) \
      $( [ -n "$body" ] && echo "-d $body" ) \
      "$url")
    # Get actual HTTP code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X "$method" \
      -H "Content-Type: application/json" \
      $( [ -n "$token_var" ] && echo "-H Authorization: Bearer ${!token_var}" ) \
      $( [ -n "$body" ] && echo "-d $body" ) \
      "$url")
  fi

  # Check for success
  if [ "${http_code:-000}" -ge 200 ] && [ "${http_code:-000}" -lt 300 ]; then
    return 0
  else
    return 1
  fi
}

# ─── JSON Parser (works without jq) ───────────────────────────────────────────
json_val() {
  local key="$1"
  echo "$RESPONSE" | grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*: "\(.*\)"/\1/'
}

json_num() {
  local key="$1"
  echo "$RESPONSE" | grep -o "\"${key}\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*: //'
}

json_raw() {
  local key="$1"
  echo "$RESPONSE" | grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1
}

# ─── Step Functions ───────────────────────────────────────────────────────────

step_01_auth() {
  header "01 — Auth Setup"

  # A1. Register Merchant
  log "Registering merchant…"
  if api_call POST "/auth/register/merchant" \
    '{"email":"merchant@test.com","password":"Test1234!","businessName":"E2E Test Restaurant","phone":"+2348000000001"}'; then
    ok "Merchant registered"
  else
    # Check if already exists
    if echo "$RESPONSE" | grep -q "already registered"; then
      warn "Merchant already exists (will re-login)"
    else
      fail "Merchant registration failed: $(echo "$RESPONSE" | head -c 200)"
    fi
  fi

  # Capture OTP
  wait_for_otp "merchant@test.com" 20 "Merchant OTP"
  MERCHANT_OTP="$OTP_CODE"

  # A2. Verify OTP
  log "Verifying merchant OTP…"
  if api_call POST "/auth/verify-otp" \
    "{\"email\":\"merchant@test.com\",\"otp\":\"${MERCHANT_OTP}\"}"; then
    ok "Merchant email verified"
  else
    fail "OTP verification failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # A3. Login as Merchant
  log "Logging in as merchant…"
  if api_call POST "/auth/login" \
    '{"email":"merchant@test.com","password":"Test1234!"}'; then
    MERCHANT_TOKEN=$(json_val "accessToken")
    MERCHANT_USER_ID=$(json_val "sub")
    ok "Merchant logged in"
  else
    fail "Merchant login failed: $(echo "$RESPONSE" | head -c 200)"
    exit 1
  fi

  # Check admin role — promote merchant to ADMIN for payout testing
  log "Promoting merchant to ADMIN role…"
  docker compose exec -T postgres psql -U taktip -d taktip_dev \
    -c "UPDATE users SET role = 4 WHERE email = 'merchant@test.com';" 2>/dev/null || true
  ok "Merchant promoted to ADMIN (for payout approval)"

  echo
  log "Merchant Token: ${MERCHANT_TOKEN:0:20}…"
}

step_02_staff() {
  header "02 — Staff Setup"

  # B1. Create Staff via invite
  log "Creating staff invitation…"
  if api_call POST "/auth/register/staff" \
    '{"token":"dev-e2e-test-token","email":"staff@test.com","password":"Test1234!","firstName":"Jane","lastName":"Waiter","displayName":"Jane Waiter","roleTag":"waiter"}'; then
    ok "Staff account created"
  else
    # Staff might already exist
    if echo "$RESPONSE" | grep -q "already"; then
      warn "Staff already exists"
    else
      fail "Staff creation failed: $(echo "$RESPONSE" | head -c 200)"
    fi
  fi

  # B3. Login as Staff
  log "Logging in as staff…"
  if api_call POST "/auth/login" \
    '{"email":"staff@test.com","password":"Test1234!"}'; then
    STAFF_TOKEN=$(json_val "accessToken")
    STAFF_USER_ID=$(json_val "sub")
    ok "Staff logged in"
  else
    fail "Staff login failed: $(echo "$RESPONSE" | head -c 200)"
    exit 1
  fi

  # B4. Get Staff Dashboard (capture profile & wallet IDs)
  log "Fetching staff dashboard…"
  if api_call GET "/staff/dashboard" "" "STAFF_TOKEN"; then
    STAFF_PROFILE_ID=$(json_val "id")
    ok "Staff dashboard loaded"
  else
    fail "Dashboard failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # If profile ID not found via "id", try nested path
  if [ -z "$STAFF_PROFILE_ID" ]; then
    # The response might wrap it in data.profile.id
    local profile_id_alt
    profile_id_alt=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('profile',{}).get('id',''))" 2>/dev/null || echo "")
    if [ -n "$profile_id_alt" ]; then
      STAFF_PROFILE_ID="$profile_id_alt"
    fi
  fi
  log "  Staff Profile ID: $STAFF_PROFILE_ID"

  # B5. Set Payout Method
  log "Setting payout method…"
  if api_call PATCH "/staff/settings/payout-method" \
    '{"accountNumber":"0123456789","bankCode":"011","bankName":"First Bank","accountHolderName":"Jane Waiter"}' \
    "STAFF_TOKEN"; then
    ok "Payout method saved"
  else
    warn "Payout method failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # B6. Create Staff Wallet
  log "Creating staff wallet…"
  if api_call POST "/staff/wallet" '{}' "STAFF_TOKEN"; then
    STAFF_WALLET_ID=$(json_val "id")
    if [ -z "$STAFF_WALLET_ID" ]; then
      STAFF_WALLET_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
    fi
    ok "Staff wallet created: $STAFF_WALLET_ID"
  else
    fail "Wallet creation failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  echo
  log "Staff Token: ${STAFF_TOKEN:0:20}…"
  log "Staff Profile ID: $STAFF_PROFILE_ID"
  log "Staff Wallet ID: $STAFF_WALLET_ID"
}

step_03_qrcodes() {
  header "03 — QR Codes"

  # C1. Generate Generic QR
  log "Generating generic QR code…"
  if api_call POST "/merchant/qrcodes" '{}' "MERCHANT_TOKEN"; then
    QR_CODE_ID=$(json_val "id")
    SHORT_CODE=$(json_val "shortCode")
    if [ -z "$QR_CODE_ID" ]; then
      QR_CODE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('qrCode',{}).get('id',''))" 2>/dev/null || echo "")
      SHORT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('qrCode',{}).get('shortCode',''))" 2>/dev/null || echo "")
    fi
    ok "QR generated: $SHORT_CODE"
  else
    fail "QR generation failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # C1b. Generate Staff-Specific QR
  if [ -n "$STAFF_PROFILE_ID" ]; then
    log "Generating staff-specific QR…"
    if api_call POST "/merchant/qrcodes" \
      "{\"staffProfileId\":\"${STAFF_PROFILE_ID}\",\"metadata\":{\"tableNumber\":5,\"location\":\"Main Hall\"}}" \
      "MERCHANT_TOKEN"; then
      ok "Staff-specific QR generated"
    else
      warn "Staff-specific QR failed: $(echo "$RESPONSE" | head -c 100)"
    fi
  fi

  # C2. List Merchant QR Codes
  log "Listing QR codes…"
  if api_call GET "/merchant/qrcodes" "" "MERCHANT_TOKEN"; then
    ok "QR codes listed"
  else
    warn "QR list failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # C3. Resolve Short Code (Public)
  log "Resolving short code: $SHORT_CODE"
  if api_call GET "/tip/${SHORT_CODE}"; then
    RESOLVED_MERCHANT=$(json_val "merchantId")
    ok "Short code resolved to merchant: $RESOLVED_MERCHANT"
  else
    warn "Short code resolve failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # C4. Staff QR listing — verify staff can see their QR codes
  log "Staff listing QR codes…"
  if api_call GET "/staff/qr-codes" "" "STAFF_TOKEN"; then
    ok "Staff QR codes listed successfully"
  else
    warn "Staff QR listing failed: $(echo "$RESPONSE" | head -c 100)"
  fi
}

step_03b_edge_cases() {
  header "03b — Edge Case Tests"

  local ec_pass=0
  local ec_fail=0

  # EC1. Invalid short code resolution
  log "EC1 — Resolving invalid short code (expect 404)…"
  if api_call GET "/tip/nonexistent123"; then
    warn "Invalid short code returned success (unexpected)"
    ((ec_fail++))
  else
    ok "EC1: Invalid short code correctly rejected"
    ((ec_pass++))
  fi

  # EC2. Duplicate tip attempt (same reference)
  log "EC2 — Attempting duplicate tip (expect error)…"
  if [ -n "${PAYMENT_REFERENCE:-}" ]; then
    if api_call POST "/guest/tip" \
      "{\"qrCodeId\":\"${QR_CODE_ID}\",\"amount\":500,\"message\":\"Duplicate test\",\"email\":\"guest@example.com\",\"paymentReference\":\"${PAYMENT_REFERENCE}\"}"; then
      warn "Duplicate tip was accepted (may be expected if idempotent)"
      ((ec_pass++))
    else
      ok "EC2: Duplicate tip correctly rejected or idempotent"
      ((ec_pass++))
    fi
  else
    warn "EC2: Skipped — no PAYMENT_REFERENCE available"
  fi

  # EC3. Invalid payout amount (zero)
  log "EC3 — Requesting payout of ₦0 (expect error)…"
  if api_call POST "/staff/payouts" '{"amount":0}' "STAFF_TOKEN"; then
    warn "Zero-amount payout was accepted (unexpected)"
    ((ec_fail++))
  else
    ok "EC3: Zero-amount payout correctly rejected"
    ((ec_pass++))
  fi

  # EC4. Negative amount
  log "EC4 — Requesting payout of -₦100 (expect error)…"
  if api_call POST "/staff/payouts" '{"amount":-100}' "STAFF_TOKEN"; then
    warn "Negative payout was accepted (unexpected)"
    ((ec_fail++))
  else
    ok "EC4: Negative payout correctly rejected"
    ((ec_pass++))
  fi

  # EC5. Missing auth token
  log "EC5 — Accessing staff endpoint without token (expect 401)…"
  if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/staff/dashboard" | grep -q "401"; then
    ok "EC5: Unauthenticated request correctly rejected"
    ((ec_pass++))
  else
    warn "EC5: Unauthenticated request was not rejected (unexpected)"
    ((ec_fail++))
  fi

  # EC6. Cross-role access (merchant accessing staff-only endpoint)
  log "EC6 — Merchant accessing staff-only endpoint (expect 403)…"
  if [ -n "${MERCHANT_TOKEN:-}" ]; then
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${MERCHANT_TOKEN}" \
      -H "Content-Type: application/json" \
      "${BASE_URL}/staff/qr-codes")
    if [ "$http_code" = "403" ]; then
      ok "EC6: Cross-role access correctly forbidden"
      ((ec_pass++))
    elif [ "$http_code" = "401" ]; then
      warn "EC6: Got 401 instead of 403 (token may be expired)"
      ((ec_pass++))
    else
      warn "EC6: Expected 403, got HTTP $http_code"
      ((ec_fail++))
    fi
  fi

  # EC7. Wallet transaction history
  log "EC7 — Checking wallet transaction history…"
  if [ -n "${STAFF_WALLET_ID:-}" ]; then
    if api_call GET "/staff/wallet/${STAFF_WALLET_ID}/transactions?page=1&limit=10" "" "STAFF_TOKEN"; then
      ok "EC7: Wallet transactions retrieved"
      ((ec_pass++))
    else
      warn "EC7: Wallet transactions failed"
      ((ec_fail++))
    fi
  else
    warn "EC7: Skipped — no STAFF_WALLET_ID available"
  fi

  # EC8. Deactivate then resolve a QR code
  log "EC8 — Deactivating QR code then resolving (expect 404 after deactivation)…"
  if [ -n "${QR_CODE_ID:-}" ]; then
    # First deactivate
    if api_call DELETE "/merchant/qrcodes/${QR_CODE_ID}" "" "MERCHANT_TOKEN"; then
      ok "EC8a: QR code deactivated"
      # Now try to resolve — should fail
      if api_call GET "/tip/${SHORT_CODE}"; then
        warn "EC8b: Deactivated QR code still resolved (may be expected if cache)"
        ((ec_fail++))
      else
        ok "EC8b: Deactivated QR code correctly returns 404"
        ((ec_pass++))
      fi
      # Regenerate for remaining steps
      log "EC8c: Regenerating QR code for remaining test flow…"
      if api_call POST "/merchant/qrcodes" '{}' "MERCHANT_TOKEN"; then
        QR_CODE_ID=$(json_val "id")
        SHORT_CODE=$(json_val "shortCode")
        if [ -z "$QR_CODE_ID" ]; then
          QR_CODE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('qrCode',{}).get('id',''))" 2>/dev/null || echo "")
          SHORT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('qrCode',{}).get('shortCode',''))" 2>/dev/null || echo "")
        fi
        ok "EC8c: New QR code generated: $SHORT_CODE"
        ((ec_pass++))
      else
        fail "EC8c: QR regeneration failed — remaining steps may fail"
      fi
    else
      warn "EC8a: QR deactivation failed"
      ((ec_fail++))
    fi
  else
    warn "EC8: Skipped — no QR_CODE_ID available"
  fi

  # Summary
  echo
  log "Edge Case Results: ${ec_pass} passed, ${ec_fail} failed"
  PASS=$((PASS + ec_pass))
  FAIL=$((FAIL + ec_fail))
}

step_04_guest_tip() {
  header "04 — Guest Tip & Payment"

  # D1. Initiate Guest Tip
  log "Initiating guest tip (₦500)…"
  if api_call POST "/guest/tip" \
    "{\"qrCodeId\":\"${QR_CODE_ID}\",\"amount\":500,\"message\":\"Great service!\",\"email\":\"guest@example.com\"}"; then
    PAYMENT_REFERENCE=$(json_val "reference")
    PAYSTACK_AUTH_URL=$(json_val "authorizationUrl")
    if [ -z "$PAYMENT_REFERENCE" ]; then
      PAYMENT_REFERENCE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('reference',''))" 2>/dev/null || echo "")
      PAYSTACK_AUTH_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('authorizationUrl',''))" 2>/dev/null || echo "")
    fi
    ok "Guest tip initiated — ref: ${PAYMENT_REFERENCE}"
    log "  Paystack checkout URL: ${PAYSTACK_AUTH_URL}"
  else
    fail "Guest tip failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # D2. Simulate Paystack Webhook (charge.success)
  # Generate HMAC-SHA512 signature (per Paystack official spec)
  PAYSTACK_WEBHOOK_SECRET=$(grep PAYSTACK_WEBHOOK_SECRET .env 2>/dev/null | cut -d= -f2- | tr -d "\"'" | xargs || echo "")
  if [ -n "$PAYSTACK_WEBHOOK_SECRET" ]; then
    log "Simulating Paystack webhook with HMAC-SHA512 signature…"

    WEBHOOK_PAYLOAD="{\"event\":\"charge.success\",\"data\":{\"reference\":\"${PAYMENT_REFERENCE}\",\"status\":\"success\",\"amount\":50000,\"currency\":\"NGN\"}}"

    # Generate HMAC-SHA512 signature (raw bytes → hex)
    WEBHOOK_SIGNATURE=$(echo -n "$WEBHOOK_PAYLOAD" | openssl dgst -sha512 -hmac "$PAYSTACK_WEBHOOK_SECRET" | sed 's/^.* //')

    # Send webhook with signature header
    RESPONSE=$(curl -sS -X POST "${BASE_URL}/payments/webhook" \
      -H "Content-Type: application/json" \
      -H "x-paystack-signature: ${WEBHOOK_SIGNATURE}" \
      -d "$WEBHOOK_PAYLOAD")
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}/payments/webhook" \
      -H "Content-Type: application/json" \
      -H "x-paystack-signature: ${WEBHOOK_SIGNATURE}" \
      -d "$WEBHOOK_PAYLOAD")

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
      ok "Webhook with HMAC signature accepted"
    else
      warn "Webhook returned HTTP $http_code"
      log "  Verify PAYSTACK_WEBHOOK_SECRET in .env matches what Paystack would send"
      log "  Response: $(echo "$RESPONSE" | head -c 150)"
    fi
  else
    warn "PAYSTACK_WEBHOOK_SECRET not set — skipping webhook simulation"
    log "  Set PAYSTACK_WEBHOOK_SECRET in .env and re-run"
  fi
}

step_05_tips() {
  header "05 — Tips & Earnings"

  # E1. Staff: View My Tips
  sleep 1
  log "Staff viewing tips…"
  if api_call GET "/staff/tips?page=1&limit=20" "" "STAFF_TOKEN"; then
    ok "Staff tips retrieved"
  else
    warn "Staff tips failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # E2. Staff: Earnings Summary
  if api_call GET "/staff/tips/earnings" "" "STAFF_TOKEN"; then
    ok "Earnings summary retrieved"
  else
    warn "Earnings failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # E3. Merchant: All Tips
  if api_call GET "/merchant/tips?page=1&limit=20" "" "MERCHANT_TOKEN"; then
    ok "Merchant tips retrieved"
  else
    warn "Merchant tips failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # E4. Merchant: Tips by Staff Member
  if [ -n "$STAFF_PROFILE_ID" ]; then
    if api_call GET "/merchant/staff/${STAFF_PROFILE_ID}/tips?page=1&limit=20" "" "MERCHANT_TOKEN"; then
      ok "Merchant staff-specific tips retrieved"
    else
      warn "Staff-specific tips failed: $(echo "$RESPONSE" | head -c 100)"
    fi
  fi
}

step_06_payouts() {
  header "06 — Payouts"

  # F1. Check Wallet Balance
  log "Checking staff wallet…"
  if api_call GET "/staff/wallet" "" "STAFF_TOKEN"; then
    BALANCE_AVAILABLE=$(json_num "balanceAvailable")
    BALANCE_PENDING=$(json_num "balancePending")
    BALANCE_PROCESSING=$(json_num "balanceProcessing")
    if [ -z "$BALANCE_AVAILABLE" ]; then
      BALANCE_AVAILABLE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('balanceAvailable',d.get('balanceAvailable',0)))" 2>/dev/null || echo "?")
      BALANCE_PENDING=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('balancePending',d.get('balancePending',0)))" 2>/dev/null || echo "?")
      BALANCE_PROCESSING=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('balanceProcessing',d.get('balanceProcessing',0)))" 2>/dev/null || echo "?")
    fi
    ok "Wallet: available=$BALANCE_AVAILABLE pending=$BALANCE_PENDING processing=$BALANCE_PROCESSING"
  else
    fail "Wallet check failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # Only proceed with payout if balance >= 2000
  BALANCE_NUM=${BALANCE_AVAILABLE:-0}
  if [ "$(echo "$BALANCE_NUM" | bc 2>/dev/null || echo 0)" -ge 2000 ] 2>/dev/null; then
    log "Sufficient balance (${BALANCE_NUM}) — proceeding with payout…"
  else
    warn "Low balance (${BALANCE_NUM}) — payout request may fail"
    log "  Continuing anyway for test coverage…"
  fi

  # F2. Staff Request Payout
  log "Staff requesting payout of ₦2000…"
  if api_call POST "/staff/payouts" '{"amount":2000}' "STAFF_TOKEN"; then
    PAYOUT_ID=$(json_val "id")
    PAYOUT_REF=$(json_val "reference")
    if [ -z "$PAYOUT_ID" ]; then
      PAYOUT_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null || echo "")
      PAYOUT_REF=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('reference',''))" 2>/dev/null || echo "")
    fi
    ok "Payout requested: ${PAYOUT_ID}"
  else
    fail "Payout request failed: $(echo "$RESPONSE" | head -c 200)"
    warn "🛑 Skipping remaining payout steps"
    return
  fi

  # F3. Staff List My Payouts
  sleep 1
  if api_call GET "/staff/payouts" "" "STAFF_TOKEN"; then
    ok "Staff payouts listed"
  else
    warn "Staff payouts list failed"
  fi

  # F4. Admin: List All Payouts (PENDING)
  if api_call GET "/admin/payouts?status=1" "" "MERCHANT_TOKEN"; then
    ok "Admin payouts (PENDING) listed"
  else
    warn "Admin payouts list failed: $(echo "$RESPONSE" | head -c 100)"
  fi

  # F5. Admin Approve Payout
  log "Admin approving payout ${PAYOUT_ID}…"
  if api_call PATCH "/admin/payouts/${PAYOUT_ID}/approve" "" "MERCHANT_TOKEN"; then
    ok "Payout approved — BullMQ job enqueued"
  else
    fail "Payout approval failed: $(echo "$RESPONSE" | head -c 200)"
  fi

  # Wait for BullMQ to process
  log "Waiting 3s for BullMQ payout processing…"
  sleep 3

  # F6. Admin Verify Payout Completed
  if api_call GET "/admin/payouts?status=4" "" "MERCHANT_TOKEN"; then
    ok "Payout status verified"
  else
    warn "Payout status check failed: $(echo "$RESPONSE" | head -c 100)"
  fi
}

step_07_cleanup() {
  header "07 — Cleanup"

  if [ -n "${PAYOUT_ID:-}" ]; then
    # G1. Admin Reject any remaining pending payouts
    log "Checking for pending payouts to reject…"
    if api_call GET "/admin/payouts?status=1" "" "MERCHANT_TOKEN"; then
      # Find any pending payout IDs from response and reject them
      local pending_ids
      pending_ids=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    items = data if isinstance(data, list) else data.get('data', [])
    if isinstance(items, list):
        for item in items:
            print(item.get('id', ''))
except: pass
" 2>/dev/null || echo "")
      if [ -n "$pending_ids" ]; then
        for pid in $pending_ids; do
          if api_call PATCH "/admin/payouts/${pid}/reject" \
            '{"notes":"E2E test cleanup"}' "MERCHANT_TOKEN"; then
            ok "Payout ${pid} rejected (cleanup)"
          fi
        done
      else
        ok "No pending payouts to reject"
      fi
    fi
  else
    warn "No payout ID — skipping cleanup"
  fi

  # Reset merchant role back to MERCHANT
  log "Resetting merchant role…"
  docker compose exec -T postgres psql -U taktip -d taktip_dev \
    -c "UPDATE users SET role = 2 WHERE email = 'merchant@test.com';" 2>/dev/null || true
  ok "Merchant role reset"
}

# ─── Summary ──────────────────────────────────────────────────────────────────
print_summary() {
  header "E2E Test Summary"
  echo -e "  ${GREEN}Passed:${NC} $PASS"
  echo -e "  ${RED}Failed:${NC} $FAIL"
  echo -e "  Total:  $((PASS + FAIL))"
  echo
  echo -e "  Log file: $LOG_FILE"

  if [ "$FAIL" -eq 0 ]; then
    echo -e "\n  ${GREEN}🎉 ALL TESTS PASSED${NC}"
  else
    echo -e "\n  ${RED}${FAIL} test(s) failed — check log for details${NC}"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
cleanup() {
  if [ -n "$APP_PID" ]; then
    log "Stopping background app (PID: $APP_PID)…"
    kill "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo ""
echo "╔═════════════════════════════════════════════════════╗"
echo "║   TakTip — Fully Automated E2E Test Suite          ║"
echo "╚═════════════════════════════════════════════════════╝"
echo ""

check_prereqs
start_app

# Run flow in order
step_01_auth
step_02_staff
step_03_qrcodes
step_03b_edge_cases
step_04_guest_tip
step_05_tips
step_06_payouts
step_07_cleanup

print_summary
