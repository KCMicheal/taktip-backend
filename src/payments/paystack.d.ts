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

  interface TransferRecipientResource {
    create(params: {
      type: string;
      name: string;
      account_number: string;
      bank_code: string;
      currency?: string;
    }): Promise<{
      status: boolean;
      data: {
        recipient_code: string;
        active: boolean;
        type: string;
        name: string;
        details: { account_number: string; bank_code: string };
      };
    }>;

    list(params?: {
      perPage?: number;
      page?: number;
    }): Promise<{
      status: boolean;
      data: Array<Record<string, unknown>>;
    }>;
  }

  interface TransferResource {
    create(params: {
      source: string;
      amount: number;
      recipient: string;
      reference?: string;
      reason?: string;
    }): Promise<{
      status: boolean;
      data: {
        transfer_code: string;
        reference: string;
        amount: number;
        recipient: { recipient_code: string; name: string };
        status: string;
      };
    }>;

    verify(params: { reference: string }): Promise<{
      status: boolean;
      data: {
        transfer_code: string;
        reference: string;
        amount: number;
        status: string;
        recipient: { recipient_code: string };
        failure_reason?: string;
      };
    }>;
  }

  interface TransferControlResource {
    balance(): Promise<{
      status: boolean;
      data: Array<{ currency: string; balance: number }>;
    }>;
    resendOTP(params: {
      transfer_code: string;
      reason: string;
    }): Promise<{ status: boolean }>;
  }

  interface PaystackInstance {
    transaction: TransactionResource;
    transfer_recipient: TransferRecipientResource;
    transfer: TransferResource;
    transfer_control: TransferControlResource;
  }

  interface PaystackConstructor {
    new (secretKey: string): PaystackInstance;
    (secretKey: string): PaystackInstance;
  }

  const Paystack: PaystackConstructor;
  export default Paystack;
  export type { PaystackInstance };
}
