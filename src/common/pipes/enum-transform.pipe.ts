import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';
import { BusinessType } from '../enums/business-type.enum';
import { EntityStatus } from '../enums/entity-status.enum';
import { InviteStatus } from '../enums/invite-status.enum';
import { ShiftStatus } from '../../shifts/enums/shift-status.enum';
import { ShiftStaffStatus } from '../../shifts/enums/shift-staff-status.enum';
import { TipStatus } from '../../tips/enums/tip-status.enum';
import { TipSource } from '../../tips/enums/tip-source.enum';
import { C2cTipFundingSource } from '../../tips/enums/c2c-tip-funding-source.enum';
import { C2cTipSenderType } from '../../tips/enums/c2c-tip-sender-type.enum';
import { KycStatus } from '../../merchant/enums/kyc-status.enum';
import { TransactionStatus } from '../../wallet/enums/transaction-status.enum';
import { TransactionType } from '../../wallet/enums/transaction-type.enum';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { PayoutStatus } from '../../payouts/enums/payout-status.enum';

/**
 * Maps query-param names to one or more numeric enums.
 *
 * When a param name appears in this map, ANY string value (key name or numeric
 * string like "2") is resolved to its integer equivalent.
 *
 * For ambiguous names like `status` that span multiple enums, the enums are
 * tried in priority order — the first match wins.
 */
const ENUM_MAP: Record<string, Record<string, unknown>[]> = {
  role: [Role],
  businessType: [BusinessType],
  status: [
    EntityStatus,
    ShiftStatus,
    TipStatus,
    PaymentStatus,
    PayoutStatus,
    TransactionStatus,
    InviteStatus,
    KycStatus,
    ShiftStaffStatus,
  ],
  inviteStatus: [InviteStatus],
  shiftStatus: [ShiftStatus],
  shiftStaffStatus: [ShiftStaffStatus],
  tipStatus: [TipStatus],
  tipSource: [TipSource],
  fundingSource: [C2cTipFundingSource],
  senderType: [C2cTipSenderType],
  kycStatus: [KycStatus],
  transactionStatus: [TransactionStatus],
  transactionType: [TransactionType],
  paymentStatus: [PaymentStatus],
  payoutStatus: [PayoutStatus],
};

@Injectable()
export class EnumTransformPipe implements PipeTransform {
  transform(value: Record<string, unknown>, _metadata: ArgumentMetadata): Record<string, unknown> {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const enumTypes = ENUM_MAP[key];
        if (!enumTypes || typeof value[key] !== 'string') continue;

        const strVal = value[key];

        // Case 1: Numeric string like "2" → convert to number if valid in any enum
        const numericValue = Number(strVal);
        if (!isNaN(numericValue)) {
          for (const enumType of enumTypes) {
            if (this.isValidNumericEnumValue(enumType, numericValue)) {
              value[key] = numericValue;
              break;
            }
          }
        }
        // Case 2: Enum key name like "MERCHANT" → look up its numeric value
        else {
          for (const enumType of enumTypes) {
            if (strVal in enumType) {
              const resolved = enumType[strVal];
              if (typeof resolved === 'number') {
                value[key] = resolved;
                break;
              }
            }
          }
        }
      }
    }
    return value;
  }

  private isValidNumericEnumValue(enumType: Record<string, unknown>, value: number): boolean {
    return Object.values(enumType).includes(value);
  }
}
