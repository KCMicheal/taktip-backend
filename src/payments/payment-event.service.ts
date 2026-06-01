import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEvent } from './entities/payment-event.entity';
import { PaymentEventType } from './enums/payment-event.enum';

export interface LogPaymentEventParams {
  paymentId: string;
  provider: string;
  event: PaymentEventType | string;
  payload?: Record<string, unknown> | null;
  status?: 'success' | 'failed' | 'pending';
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit logger for payment events.
 *
 * Every interaction with a payment provider is recorded here to
 * preserve a complete audit trail for accounting, failure analysis,
 * and reporting.  Rows are never updated or deleted.
 */
@Injectable()
export class PaymentEventService {
  private readonly logger = new Logger(PaymentEventService.name);

  constructor(
    @InjectRepository(PaymentEvent)
    private readonly paymentEventRepository: Repository<PaymentEvent>,
  ) {}

  /**
   * Record a payment lifecycle event.
   *
   * This is a fire-and-forget log — the caller is not expected to
   * use the return value for business logic.
   */
  async log(params: LogPaymentEventParams): Promise<PaymentEvent> {
    const event = this.paymentEventRepository.create({
      paymentId: params.paymentId,
      provider: params.provider,
      event: params.event,
      payload: params.payload ?? null,
      status: params.status ?? 'success',
      errorMessage: params.errorMessage ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });

    const saved = await this.paymentEventRepository.save(event);

    if (params.status === 'failed') {
      this.logger.warn(
        `[${params.provider}] ${params.event}: ${params.errorMessage ?? 'unknown error'} ` +
          `(paymentId: ${params.paymentId})`,
      );
    }

    return saved;
  }
}
