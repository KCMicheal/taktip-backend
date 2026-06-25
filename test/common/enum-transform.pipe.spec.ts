import { ArgumentMetadata } from '@nestjs/common';
import { EnumTransformPipe } from '../../src/common/pipes/enum-transform.pipe';
import { Role } from '../../src/auth/enums/role.enum';
import { BusinessType } from '../../src/common/enums/business-type.enum';
import { EntityStatus } from '../../src/common/enums/entity-status.enum';
import { InviteStatus } from '../../src/common/enums/invite-status.enum';
import { ShiftStatus } from '../../src/shifts/enums/shift-status.enum';
import { ShiftStaffStatus } from '../../src/shifts/enums/shift-staff-status.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { C2cTipFundingSource } from '../../src/tips/enums/c2c-tip-funding-source.enum';
import { C2cTipSenderType } from '../../src/tips/enums/c2c-tip-sender-type.enum';
import { KycStatus } from '../../src/merchant/enums/kyc-status.enum';
import { TransactionStatus } from '../../src/wallet/enums/transaction-status.enum';
import { TransactionType } from '../../src/wallet/enums/transaction-type.enum';
import { PaymentStatus } from '../../src/payments/enums/payment-status.enum';
import { PayoutStatus } from '../../src/payouts/enums/payout-status.enum';

const FAKE_META = {} as ArgumentMetadata;

describe('EnumTransformPipe', () => {
  let pipe: EnumTransformPipe;

  beforeEach(() => {
    pipe = new EnumTransformPipe();
  });

  // -------------------------------------------------------------------------
  // Edge cases – passthrough behaviour
  // -------------------------------------------------------------------------
  it('should return null when value is null', () => {
    expect(pipe.transform(null as unknown as Record<string, unknown>, FAKE_META)).toBeNull();
  });

  it('should return undefined when value is undefined', () => {
    expect(pipe.transform(undefined as unknown as Record<string, unknown>, FAKE_META)).toBeUndefined();
  });

  it('should return value as-is for non-object input', () => {
    const result = pipe.transform('just-a-string' as unknown as Record<string, unknown>, FAKE_META);
    expect(result).toBe('just-a-string');
  });

  it('should pass through fields that are not strings', () => {
    const input = { status: 1, name: 'Test' };
    const result = pipe.transform(input, FAKE_META);
    expect(result).toEqual({ status: 1, name: 'Test' });
  });

  it('should pass through unknown field names unchanged', () => {
    const input = { unknownField: 'some_value' };
    const result = pipe.transform(input, FAKE_META);
    expect(result).toEqual({ unknownField: 'some_value' });
  });

  it('should pass through unrelated fields alongside known ones', () => {
    const input = { status: 'ACTIVE', name: 'Test', page: '1' };
    const result = pipe.transform(input, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.ACTIVE, name: 'Test', page: '1' });
  });

  // -------------------------------------------------------------------------
  // status — priority‑ordered multi‑enum resolution (9 enums)
  // -------------------------------------------------------------------------
  it('should resolve status="ACTIVE" → EntityStatus.ACTIVE (1)', () => {
    const result = pipe.transform({ status: 'ACTIVE' }, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.ACTIVE });
  });

  it('should resolve status="INACTIVE" → EntityStatus.INACTIVE (2)', () => {
    const result = pipe.transform({ status: 'INACTIVE' }, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.INACTIVE });
  });

  it('should resolve status="DRAFT" → ShiftStatus.DRAFT (1) via priority', () => {
    // EntityStatus has no DRAFT, so it falls through to ShiftStatus
    const result = pipe.transform({ status: 'DRAFT' }, FAKE_META);
    expect(result).toEqual({ status: ShiftStatus.DRAFT });
  });

  it('should resolve status="COMPLETED" → ShiftStatus.COMPLETED (4) via priority (ShiftStatus checked before TipStatus)', () => {
    // EntityStatus has no COMPLETED, ShiftStatus.COMPLETED = 4 (tried 2nd, matches first),
    // TipStatus.COMPLETED = 1 but ShiftStatus is earlier in priority
    const result = pipe.transform({ status: 'COMPLETED' }, FAKE_META);
    expect(result).toEqual({ status: ShiftStatus.COMPLETED });
  });

  it('should resolve status="CANCELLED" → PaymentStatus.CANCELLED (5) via priority', () => {
    // EntityStatus has no CANCELLED, ShiftStatus CANCELLED=5, but so does PaymentStatus
    // ShiftStatus is tried first
    const result = pipe.transform({ status: 'CANCELLED' }, FAKE_META);
    expect(result).toEqual({ status: ShiftStatus.CANCELLED });
  });

  it('should resolve status="APPROVED" → PayoutStatus.APPROVED (2) via priority', () => {
    const result = pipe.transform({ status: 'APPROVED' }, FAKE_META);
    expect(result).toEqual({ status: PayoutStatus.APPROVED });
  });

  it('should resolve status="CLOCKED_IN" → ShiftStaffStatus.CLOCKED_IN (2) via priority', () => {
    const result = pipe.transform({ status: 'CLOCKED_IN' }, FAKE_META);
    expect(result).toEqual({ status: ShiftStaffStatus.CLOCKED_IN });
  });

  // -------------------------------------------------------------------------
  // status — numeric string inputs
  // -------------------------------------------------------------------------
  it('should resolve status="1" → EntityStatus.ACTIVE (1)', () => {
    const result = pipe.transform({ status: '1' }, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.ACTIVE });
  });

  it('should resolve status="2" → EntityStatus.INACTIVE (2)', () => {
    const result = pipe.transform({ status: '2' }, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.INACTIVE });
  });

  it('should resolve status="5" → EntityStatus.DELETED (5) since EntityStatus matches first', () => {
    const result = pipe.transform({ status: '5' }, FAKE_META);
    expect(result).toEqual({ status: EntityStatus.DELETED });
  });

  it('should leave status="99" as string when no enum matches', () => {
    const result = pipe.transform({ status: '99' }, FAKE_META);
    expect(result).toEqual({ status: '99' });
  });

  it('should leave an invalid key name as string when no enum has it', () => {
    const result = pipe.transform({ status: 'NONEXISTENT' }, FAKE_META);
    expect(result).toEqual({ status: 'NONEXISTENT' });
  });

  // -------------------------------------------------------------------------
  // role
  // -------------------------------------------------------------------------
  it('should resolve role="ADMIN" → Role.ADMIN (4)', () => {
    const result = pipe.transform({ role: 'ADMIN' }, FAKE_META);
    expect(result).toEqual({ role: Role.ADMIN });
  });

  it('should resolve role="3" → Role.STAFF (3)', () => {
    const result = pipe.transform({ role: '3' }, FAKE_META);
    expect(result).toEqual({ role: Role.STAFF });
  });

  // -------------------------------------------------------------------------
  // businessType
  // -------------------------------------------------------------------------
  it('should resolve businessType="RESTAURANT" → BusinessType.RESTAURANT (1)', () => {
    const result = pipe.transform({ businessType: 'RESTAURANT' }, FAKE_META);
    expect(result).toEqual({ businessType: BusinessType.RESTAURANT });
  });

  it('should resolve businessType="3" → BusinessType.BAR (3)', () => {
    const result = pipe.transform({ businessType: '3' }, FAKE_META);
    expect(result).toEqual({ businessType: BusinessType.BAR });
  });

  // -------------------------------------------------------------------------
  // inviteStatus
  // -------------------------------------------------------------------------
  it('should resolve inviteStatus="ACCEPTED" → InviteStatus.ACCEPTED (2)', () => {
    const result = pipe.transform({ inviteStatus: 'ACCEPTED' }, FAKE_META);
    expect(result).toEqual({ inviteStatus: InviteStatus.ACCEPTED });
  });

  it('should resolve inviteStatus="3" → InviteStatus.EXPIRED (3)', () => {
    const result = pipe.transform({ inviteStatus: '3' }, FAKE_META);
    expect(result).toEqual({ inviteStatus: InviteStatus.EXPIRED });
  });

  // -------------------------------------------------------------------------
  // shiftStatus
  // -------------------------------------------------------------------------
  it('should resolve shiftStatus="PUBLISHED" → ShiftStatus.PUBLISHED (2)', () => {
    const result = pipe.transform({ shiftStatus: 'PUBLISHED' }, FAKE_META);
    expect(result).toEqual({ shiftStatus: ShiftStatus.PUBLISHED });
  });

  it('should resolve shiftStatus="4" → ShiftStatus.COMPLETED (4)', () => {
    const result = pipe.transform({ shiftStatus: '4' }, FAKE_META);
    expect(result).toEqual({ shiftStatus: ShiftStatus.COMPLETED });
  });

  // -------------------------------------------------------------------------
  // shiftStaffStatus
  // -------------------------------------------------------------------------
  it('should resolve shiftStaffStatus="NO_SHOW" → ShiftStaffStatus.NO_SHOW (4)', () => {
    const result = pipe.transform({ shiftStaffStatus: 'NO_SHOW' }, FAKE_META);
    expect(result).toEqual({ shiftStaffStatus: ShiftStaffStatus.NO_SHOW });
  });

  // -------------------------------------------------------------------------
  // tipStatus
  // -------------------------------------------------------------------------
  it('should resolve tipStatus="PENDING" → TipStatus.PENDING (2)', () => {
    const result = pipe.transform({ tipStatus: 'PENDING' }, FAKE_META);
    expect(result).toEqual({ tipStatus: TipStatus.PENDING });
  });

  it('should resolve tipStatus="3" → TipStatus.REFUNDED (3)', () => {
    const result = pipe.transform({ tipStatus: '3' }, FAKE_META);
    expect(result).toEqual({ tipStatus: TipStatus.REFUNDED });
  });

  // -------------------------------------------------------------------------
  // tipSource
  // -------------------------------------------------------------------------
  it('should resolve tipSource="GUEST" → TipSource.GUEST (1)', () => {
    const result = pipe.transform({ tipSource: 'GUEST' }, FAKE_META);
    expect(result).toEqual({ tipSource: TipSource.GUEST });
  });

  it('should resolve tipSource="3" → TipSource.CUSTOMER_TO_CUSTOMER (3)', () => {
    const result = pipe.transform({ tipSource: '3' }, FAKE_META);
    expect(result).toEqual({ tipSource: TipSource.CUSTOMER_TO_CUSTOMER });
  });

  // -------------------------------------------------------------------------
  // fundingSource
  // -------------------------------------------------------------------------
  it('should resolve fundingSource="CARD" → C2cTipFundingSource.CARD (2)', () => {
    const result = pipe.transform({ fundingSource: 'CARD' }, FAKE_META);
    expect(result).toEqual({ fundingSource: C2cTipFundingSource.CARD });
  });

  it('should resolve fundingSource="1" → C2cTipFundingSource.WALLET (1)', () => {
    const result = pipe.transform({ fundingSource: '1' }, FAKE_META);
    expect(result).toEqual({ fundingSource: C2cTipFundingSource.WALLET });
  });

  // -------------------------------------------------------------------------
  // senderType
  // -------------------------------------------------------------------------
  it('should resolve senderType="GUEST" → C2cTipSenderType.GUEST (2)', () => {
    const result = pipe.transform({ senderType: 'GUEST' }, FAKE_META);
    expect(result).toEqual({ senderType: C2cTipSenderType.GUEST });
  });

  it('should resolve senderType="1" → C2cTipSenderType.CUSTOMER (1)', () => {
    const result = pipe.transform({ senderType: '1' }, FAKE_META);
    expect(result).toEqual({ senderType: C2cTipSenderType.CUSTOMER });
  });

  // -------------------------------------------------------------------------
  // kycStatus
  // -------------------------------------------------------------------------
  it('should resolve kycStatus="APPROVED" → KycStatus.APPROVED (2)', () => {
    const result = pipe.transform({ kycStatus: 'APPROVED' }, FAKE_META);
    expect(result).toEqual({ kycStatus: KycStatus.APPROVED });
  });

  it('should resolve kycStatus="3" → KycStatus.REJECTED (3)', () => {
    const result = pipe.transform({ kycStatus: '3' }, FAKE_META);
    expect(result).toEqual({ kycStatus: KycStatus.REJECTED });
  });

  // -------------------------------------------------------------------------
  // transactionStatus
  // -------------------------------------------------------------------------
  it('should resolve transactionStatus="COMPLETED" → TransactionStatus.COMPLETED (2)', () => {
    const result = pipe.transform({ transactionStatus: 'COMPLETED' }, FAKE_META);
    expect(result).toEqual({ transactionStatus: TransactionStatus.COMPLETED });
  });

  it('should resolve transactionStatus="3" → TransactionStatus.FAILED (3)', () => {
    const result = pipe.transform({ transactionStatus: '3' }, FAKE_META);
    expect(result).toEqual({ transactionStatus: TransactionStatus.FAILED });
  });

  // -------------------------------------------------------------------------
  // transactionType
  // -------------------------------------------------------------------------
  it('should resolve transactionType="DEPOSIT" → TransactionType.DEPOSIT (1)', () => {
    const result = pipe.transform({ transactionType: 'DEPOSIT' }, FAKE_META);
    expect(result).toEqual({ transactionType: TransactionType.DEPOSIT });
  });

  it('should resolve transactionType="9" → TransactionType.CUSTOMER_TIP_IN (9)', () => {
    const result = pipe.transform({ transactionType: '9' }, FAKE_META);
    expect(result).toEqual({ transactionType: TransactionType.CUSTOMER_TIP_IN });
  });

  // -------------------------------------------------------------------------
  // paymentStatus
  // -------------------------------------------------------------------------
  it('should resolve paymentStatus="SUCCESS" → PaymentStatus.SUCCESS (2)', () => {
    const result = pipe.transform({ paymentStatus: 'SUCCESS' }, FAKE_META);
    expect(result).toEqual({ paymentStatus: PaymentStatus.SUCCESS });
  });

  it('should resolve paymentStatus="4" → PaymentStatus.REFUNDED (4)', () => {
    const result = pipe.transform({ paymentStatus: '4' }, FAKE_META);
    expect(result).toEqual({ paymentStatus: PaymentStatus.REFUNDED });
  });

  // -------------------------------------------------------------------------
  // payoutStatus
  // -------------------------------------------------------------------------
  it('should resolve payoutStatus="COMPLETED" → PayoutStatus.COMPLETED (4)', () => {
    const result = pipe.transform({ payoutStatus: 'COMPLETED' }, FAKE_META);
    expect(result).toEqual({ payoutStatus: PayoutStatus.COMPLETED });
  });

  it('should resolve payoutStatus="6" → PayoutStatus.REJECTED (6)', () => {
    const result = pipe.transform({ payoutStatus: '6' }, FAKE_META);
    expect(result).toEqual({ payoutStatus: PayoutStatus.REJECTED });
  });
});
