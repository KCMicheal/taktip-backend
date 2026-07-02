/**
 * Provider-agnostic payment interface.
 *
 * Implement this interface to add a new payment provider (Paystack,
 * Stripe, Flutterwave, etc.).  The controller depends on the
 * PAYMENT_PROVIDER token and is completely decoupled from the
 * concrete provider implementation.
 */

// ───────── Request / Response types ─────────

export interface InitializeTransactionParams {
  /** Customer email (required by most providers) */
  email: string;
  /** Amount in major currency units (e.g., 50.00 for NGN 50) */
  amount: number;
  /**
   * Our unique reference for this transaction.
   * If omitted, the provider will generate one.
   */
  reference?: string;
  /** Currency code (defaults to 'NGN') */
  currency?: string;
  /** Arbitrary metadata forwarded to the provider */
  metadata?: Record<string, unknown>;
  /**
   * Full callback URL for redirect after payment.
   * If omitted, the provider uses a default (e.g., APP_URL + '/tip/callback').
   */
  callbackUrl?: string;
}

export interface InitializeTransactionResult {
  /** URL to redirect the customer to for payment */
  authorizationUrl: string;
  /** Our transaction reference */
  reference: string;
  /** Provider access code (varies by provider) */
  accessCode: string;
}

export interface VerifyTransactionResult {
  /** Whether the payment was successful */
  status: boolean;
  /** Amount in major currency units */
  amount: number;
  /** Transaction currency */
  currency: string;
  /** Provider's response message (e.g., 'Successful', 'Approved') */
  gatewayResponse: string | null;
  /** ISO timestamp of when payment was completed */
  paidAt: string | null;
  /** Payment channel (e.g., 'card', 'bank_transfer', 'ussd') */
  channel: string;
  /** Metadata from the provider response */
  metadata: Record<string, unknown> | null;
  /** Provider's own reference/ID for this transaction */
  providerReference: string | null;
  /** Full raw response from the provider (for debugging) */
  raw: Record<string, unknown>;
}

// ───────── Payment Provider interface ─────────

export interface PaymentProvider {
  /** Short identifier: 'paystack' | 'stripe' | 'flutterwave' */
  readonly name: string;

  /**
   * Initialize a transaction / create a checkout session.
   * Returns a URL to redirect the customer to.
   */
  initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult>;

  /**
   * Verify a transaction by reference.
   * Called after the customer returns from the checkout page.
   */
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;

  /**
   * Process an incoming webhook event.
   * The provider is responsible for updating Payment, Tip, and Wallet records.
   */
  handleWebhook(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Verify the HMAC signature of a webhook payload.
   * Returns true if the signature is valid.
   */
  verifyWebhookSignature(signature: string, rawBody: string): boolean;

  // ───────── Transfer / Payout methods ─────────

  /**
   * Create a transfer recipient on the provider's side.
   * Returns the provider's recipient code (e.g., Paystack's `recipient_code`).
   */
  createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
  }): Promise<{ recipientCode: string; active: boolean }>;

  /**
   * Initiate a transfer (payout) to a previously created recipient.
   * Amount should be in the smallest currency unit (e.g., kobo for NGN).
   * Returns the provider's transfer reference / code.
   */
  initiateTransfer(params: {
    amount: number;
    recipientCode: string;
    reference?: string;
    reason?: string;
  }): Promise<{
    transferCode: string;
    reference: string;
    status: string;
  }>;

  /**
   * Verify a transfer by reference.
   * Returns the current status of the transfer.
   */
  verifyTransfer(reference: string): Promise<{
    transferCode: string;
    reference: string;
    amount: number;
    status: string;
    failureReason?: string;
  }>;

  /**
   * Check the provider's account balance.
   */
  checkProviderBalance(): Promise<Array<{ currency: string; balance: number }>>;
}
