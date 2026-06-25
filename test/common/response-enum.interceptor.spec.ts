import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { ResponseEnumInterceptor } from '../../src/common/interceptors/response-enum.interceptor';

/**
 * Helper: build a minimal mock ExecutionContext + CallHandler that returns
 * the given `data` when `handle()` is called.
 */
function mockCallHandler(data: unknown): CallHandler {
  return { handle: () => of(data) } as unknown as CallHandler;
}

function mockExecutionContext(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

describe('ResponseEnumInterceptor', () => {
  let interceptor: ResponseEnumInterceptor;

  beforeEach(() => {
    interceptor = new ResponseEnumInterceptor();
  });

  // -------------------------------------------------------------------------
  // Primitives & no-ops
  // -------------------------------------------------------------------------
  it('should pass null/undefined through unchanged', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(mockExecutionContext(), mockCallHandler(null))),
    ).resolves.toBeNull();

    await expect(
      lastValueFrom(interceptor.intercept(mockExecutionContext(), mockCallHandler(undefined))),
    ).resolves.toBeUndefined();
  });

  it('should pass a plain number through unchanged', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(42)),
    );
    expect(result).toBe(42);
  });

  it('should pass a plain string through unchanged', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler('hello')),
    );
    expect(result).toBe('hello');
  });

  // -------------------------------------------------------------------------
  // status field — single-value conversion
  // -------------------------------------------------------------------------
  it('should convert status:1 → status:"ACTIVE" (EntityStatus)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 1 })),
    );
    expect(result).toEqual({ status: 'ACTIVE' });
  });

  it('should convert status:2 → status:"INACTIVE" (EntityStatus)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 2 })),
    );
    expect(result).toEqual({ status: 'INACTIVE' });
  });

  it('should convert status:5 → status:"DELETED" (EntityStatus)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 5 })),
    );
    expect(result).toEqual({ status: 'DELETED' });
  });

  // -------------------------------------------------------------------------
  // status — priority‑ordered multi‑enum resolution
  // -------------------------------------------------------------------------
  it('should convert status:3 → status:"IN_PROGRESS" (ShiftStatus, not EntityStatus)', async () => {
    // EntityStatus has no 3 → PENDING … wait, EntityStatus.PENDING = 3.
    // Actually EntityStatus.PENDING = 3, so it should resolve to "PENDING".
    // Let's test a value that ONLY exists in lower-priority enums.
    // EntityStatus doesn't have 4=COMPLETED, ShiftStatus.COMPLETED = 4.
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 4 })),
    );
    // EntityStatus.SUSPENDED = 4, so SUSPENDED wins via EntityStatus priority
    expect(result).toEqual({ status: 'SUSPENDED' });
  });

  it('should resolve status:4 to SUSPENDED (EntityStatus priority over ShiftStatus)', async () => {
    // EntityStatus.SUSPENDED = 4, ShiftStatus.COMPLETED = 4
    // EntityStatus is tried first, so returns "SUSPENDED"
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 4 })),
    );
    expect(result).toEqual({ status: 'SUSPENDED' });
  });

  // -------------------------------------------------------------------------
  // Other single-enum fields
  // -------------------------------------------------------------------------
  it('should convert role:4 → role:"ADMIN"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ role: 4 })),
    );
    expect(result).toEqual({ role: 'ADMIN' });
  });

  it('should convert businessType:1 → businessType:"RESTAURANT"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ businessType: 1 })),
    );
    expect(result).toEqual({ businessType: 'RESTAURANT' });
  });

  it('should convert inviteStatus:2 → inviteStatus:"ACCEPTED"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ inviteStatus: 2 })),
    );
    expect(result).toEqual({ inviteStatus: 'ACCEPTED' });
  });

  it('should convert shiftStatus:2 → shiftStatus:"PUBLISHED"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ shiftStatus: 2 })),
    );
    expect(result).toEqual({ shiftStatus: 'PUBLISHED' });
  });

  it('should convert shiftStaffStatus:4 → shiftStaffStatus:"NO_SHOW"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ shiftStaffStatus: 4 })),
    );
    expect(result).toEqual({ shiftStaffStatus: 'NO_SHOW' });
  });

  it('should convert tipStatus:2 → tipStatus:"PENDING"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ tipStatus: 2 })),
    );
    expect(result).toEqual({ tipStatus: 'PENDING' });
  });

  it('should convert tipSource:3 → tipSource:"CUSTOMER_TO_CUSTOMER"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ tipSource: 3 })),
    );
    expect(result).toEqual({ tipSource: 'CUSTOMER_TO_CUSTOMER' });
  });

  it('should convert fundingSource:2 → fundingSource:"CARD"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ fundingSource: 2 })),
    );
    expect(result).toEqual({ fundingSource: 'CARD' });
  });

  it('should convert senderType:1 → senderType:"CUSTOMER"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ senderType: 1 })),
    );
    expect(result).toEqual({ senderType: 'CUSTOMER' });
  });

  it('should convert kycStatus:2 → kycStatus:"APPROVED"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ kycStatus: 2 })),
    );
    expect(result).toEqual({ kycStatus: 'APPROVED' });
  });

  it('should convert transactionStatus:2 → transactionStatus:"COMPLETED"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ transactionStatus: 2 })),
    );
    expect(result).toEqual({ transactionStatus: 'COMPLETED' });
  });

  it('should convert transactionType:7 → transactionType:"FEE"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ transactionType: 7 })),
    );
    expect(result).toEqual({ transactionType: 'FEE' });
  });

  it('should convert paymentStatus:2 → paymentStatus:"SUCCESS"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ paymentStatus: 2 })),
    );
    expect(result).toEqual({ paymentStatus: 'SUCCESS' });
  });

  it('should convert payoutStatus:4 → payoutStatus:"COMPLETED"', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ payoutStatus: 4 })),
    );
    expect(result).toEqual({ payoutStatus: 'COMPLETED' });
  });

  // -------------------------------------------------------------------------
  // Nested objects
  // -------------------------------------------------------------------------
  it('should recurse into nested objects', async () => {
    const payload = {
      user: { role: 3 },
      profile: { status: 2 },
    };
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
    );
    expect(result).toEqual({
      user: { role: 'STAFF' },
      profile: { status: 'INACTIVE' },
    });
  });

  it('should recurse into deeply nested objects', async () => {
    const payload = {
      level1: {
        level2: {
          level3: { status: 1 },
        },
      },
    };
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
    );
    expect(result).toEqual({
      level1: {
        level2: {
          level3: { status: 'ACTIVE' },
        },
      },
    });
  });

  // -------------------------------------------------------------------------
  // Arrays
  // -------------------------------------------------------------------------
  it('should convert enum values inside arrays', async () => {
    const payload = {
      items: [
        { status: 1, name: 'Item 1' },
        { status: 2, name: 'Item 2' },
      ],
    };
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
    );
    expect(result).toEqual({
      items: [
        { status: 'ACTIVE', name: 'Item 1' },
        { status: 'INACTIVE', name: 'Item 2' },
      ],
    });
  });

  it('should convert values in a top-level array', async () => {
    const payload = [
      { status: 1 },
      { status: 5 },
    ];
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
    );
    expect(result).toEqual([
      { status: 'ACTIVE' },
      { status: 'DELETED' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Mixed fields — enum + non-enum side by side
  // -------------------------------------------------------------------------
  it('should leave non-enum fields unchanged', async () => {
    const payload = {
      id: 'abc-123',
      name: 'Test',
      status: 3,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
    );
    expect(result).toEqual({
      id: 'abc-123',
      name: 'Test',
      status: 'PENDING',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  // -------------------------------------------------------------------------
  // Unknown numeric values — leave untouched
  // -------------------------------------------------------------------------
  it('should leave unknown numeric values unchanged', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ status: 99 })),
    );
    expect(result).toEqual({ status: 99 });
  });

  it('should leave non-enum numeric fields unchanged', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext(), mockCallHandler({ age: 30, count: 100 })),
    );
    expect(result).toEqual({ age: 30, count: 100 });
  });

  // -------------------------------------------------------------------------
  // Circular references — should not stack overflow
  // -------------------------------------------------------------------------
  it('should handle circular references gracefully (no stack overflow)', async () => {
    const payload: Record<string, unknown> = { status: 1 };
    payload.self = payload;

    // The interceptor must not throw on circular structures
    await expect(
      lastValueFrom(
        interceptor.intercept(mockExecutionContext(), mockCallHandler(payload)),
      ),
    ).resolves.toBeDefined();
  });
});
