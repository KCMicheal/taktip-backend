/**
 * NestJS DI token for the active payment provider.
 *
 * Inject this token wherever a provider-agnostic payment interface
 * is needed:
 *
 *   @Inject(PAYMENT_PROVIDER)
 *   private readonly paymentProvider: PaymentProvider;
 */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
