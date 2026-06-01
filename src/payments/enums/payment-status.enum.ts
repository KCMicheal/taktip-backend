/**
 * Numeric enum for payment status — provider-agnostic.
 *
 * 1 = PENDING, 2 = SUCCESS, 3 = FAILED, 4 = REFUNDED, 5 = CANCELLED
 */
export enum PaymentStatus {
  PENDING = 1,
  SUCCESS = 2,
  FAILED = 3,
  REFUNDED = 4,
  CANCELLED = 5,
}
