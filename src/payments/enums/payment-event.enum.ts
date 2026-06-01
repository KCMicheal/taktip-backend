/**
 * Payment event types for the append-only audit log.
 *
 * These capture every interaction with a payment provider for
 * accounting, reporting, and failure analysis.
 */
export enum PaymentEventType {
  /** Before calling the provider's initialize endpoint */
  INITIALIZE_REQUESTED = 'initialize_requested',
  /** Provider returned an authorization URL successfully */
  INITIALIZE_SUCCESS = 'initialize_success',
  /** Provider initialize call failed */
  INITIALIZE_FAILED = 'initialize_failed',

  /** Before verifying a transaction */
  VERIFY_REQUESTED = 'verify_requested',
  /** Verification succeeded (transaction may still be failed/pending) */
  VERIFY_SUCCESS = 'verify_success',
  /** Verification call itself failed */
  VERIFY_FAILED = 'verify_failed',

  /** Raw webhook payload received */
  WEBHOOK_RECEIVED = 'webhook_received',
  /** Webhook event type not handled */
  WEBHOOK_IGNORED = 'webhook_ignored',
  /** HMAC signature check failed */
  WEBHOOK_SIGNATURE_FAILED = 'webhook_signature_failed',

  /** charge.success — payment marked SUCCESS */
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  /** charge.failed — payment marked FAILED */
  PAYMENT_FAILED = 'payment_failed',
  /** Payment refunded */
  PAYMENT_REFUNDED = 'payment_refunded',
  /** Payment cancelled by user or system */
  PAYMENT_CANCELLED = 'payment_cancelled',
}
