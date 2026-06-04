# FE Bug Tracker

## Protocol
1. Every "box" (bug/fix request) received is logged here with timestamp.
2. Before processing a new box, ALL previously open boxes are re-checked to ensure completeness.
3. Each box is closed only after code fix + verification (lint/typecheck/test).
4. If a fix creates a regression, it gets a new box logged immediately.

---

## Box #1 — GET /v1/tip/:shortCode missing qrCodeId in response
- **Filed**: 2026-06-04 21:25
- **Description**: The `GET /v1/tip/:shortCode` endpoint response doesn't include `qrCodeId`, even though it's on the `Tip` entity.
- **Root Cause**: 
  - `resolveQrCode()` in `qrcodes.controller.ts` already returns `qrCodeId: qrCode.id` ✅ (fixed in prior commit)
  - `TipResponseDto` was missing `qrCodeId` field — used by `findByMerchant()` in merchant tip list endpoints ❌
- **Files Changed**:
  - `src/tips/dto/tip-response.dto.ts` — added `qrCodeId` field
  - `src/tips/tips.service.ts` — added `qrCodeId` to `findByMerchant()` mapping
- **Status**: ✅ FIXED
- **Verified**:

---

## Box #2 — GET /v1/staff/wallet consolidated response missing `reference` in wallet entries
- **Filed**: 2026-06-04 21:44
- **Description**: The consolidated staff wallet endpoint response lacks `reference` in each wallet entry.
- **Root Cause**: `StaffWalletEntryDto` interface and `getStaffConsolidatedWallets()` method both omitted `reference`.
- **Files Changed**:
  - `src/wallet/wallet.service.ts` — `StaffWalletEntryDto` interface + service method
  - `src/wallet/staff-wallet.controller.ts` — Swagger schema
  - `test/wallet/staff-wallet.controller.spec.ts` — test mock data
- **Status**: ✅ FIXED
- **Verified**:

---

## Box #3 — Wallet entries in consolidated response missing `id` / `walletId` field
- **Filed**: 2026-06-04 21:47
- **Description**: Each entry in the wallets array has merchantName, merchantShortCode, balanceAvailable, balancePending, balanceProcessing but NO id or walletId field. walletId is always null.
- **Root Cause**: Same as Box #2 — interface + method omitted `id`.
- **Files Changed**: Same as Box #2 (fixed simultaneously)
- **Status**: ✅ FIXED
- **Verified**:
