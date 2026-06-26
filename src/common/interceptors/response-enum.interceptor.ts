import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
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
 * Maps response-field names to one or more numeric enums.
 *
 * When a field name appears in this map, any numeric value found on that field
 * (at any depth in the response body) is converted to its string key name.
 *
 * For ambiguous field names like `status` that exist in multiple enums, enums
 * are tried in priority order — the first match wins.
 */
const RESPONSE_ENUM_FIELDS: Record<string, Record<string, unknown>[]> = {
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
  source: [TipSource],
  tipSource: [TipSource],
  fundingSource: [C2cTipFundingSource],
  senderType: [C2cTipSenderType],
  kycStatus: [KycStatus],
  transactionStatus: [TransactionStatus],
  transactionType: [TransactionType],
  paymentStatus: [PaymentStatus],
  payoutStatus: [PayoutStatus],
};

/**
 * Attempt to convert a numeric value to the string key name from the first
 * enum that contains it.
 *
 * @returns the string key (e.g. "ACTIVE") if found, or the original value.
 */
function valueToString(value: unknown, key: string): unknown {
  if (typeof value !== 'number') return value;

  const enums = RESPONSE_ENUM_FIELDS[key];
  if (!enums) return value;

  for (const enumObj of enums) {
    const stringKey = enumObj[value];
    if (typeof stringKey === 'string') {
      return stringKey;
    }
  }
  return value;
}

/**
 * Recursively walk a response payload and convert numeric enum fields.
 */
function transformPayload(payload: unknown, visited = new Set<unknown>()): unknown {
  if (payload === null || payload === undefined) return payload;

  // Avoid circular references
  if (visited.has(payload)) return payload;
  visited.add(payload);

  // Preserve Date objects — they serialise to ISO strings via JSON.stringify
  if (payload instanceof Date) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => transformPayload(item, visited));
  }

  if (typeof payload === 'object') {
    const transformed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
      // Step 1 — convert the value if it's a known enum field
      transformed[key] = valueToString(val, key);
      // Step 2 — recurse into sub-objects / arrays (but not Dates, already handled above)
      if (typeof transformed[key] === 'object' && transformed[key] !== null) {
        transformed[key] = transformPayload(transformed[key], visited);
      }
    }
    return transformed;
  }

  return payload;
}

@Injectable()
export class ResponseEnumInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => transformPayload(data)));
  }
}
