declare module 'paystack-api' {
  interface TransactionResource {
    initialize(params: {
      email: string;
      amount: number;
      reference?: string;
      metadata?: Record<string, unknown>;
      callback_url?: string;
    }): Promise<{
      data: { authorization_url: string; access_code: string };
    }>;

    verify(params: { reference: string }): Promise<{
      data: { status: string; amount: number; metadata: unknown };
    }>;
  }

  interface PaystackInstance {
    transaction: TransactionResource;
  }

  interface PaystackConstructor {
    new (secretKey: string): PaystackInstance;
    (secretKey: string): PaystackInstance;
  }

  const Paystack: PaystackConstructor;
  export default Paystack;
  export type { PaystackInstance };
}
