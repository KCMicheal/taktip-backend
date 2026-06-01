import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import {
  PaymentProvider,
  InitializeTransactionParams,
} from './providers/interfaces/payment-provider.interface';
import { PAYMENT_PROVIDER } from './providers/providers.constants';
import { QrCode } from '../qrcodes/entities/qrcode.entity';
import { Tip } from '../tips/entities/tip.entity';
import { TipSource } from '../tips/enums/tip-source.enum';
import { TipStatus } from '../tips/enums/tip-status.enum';
import { Payment } from './entities/payment.entity';

// ───────── DTOs ─────────

class InitiateGuestTipDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'QR code UUID' })
  @IsUUID()
  qrCodeId: string;

  @ApiProperty({ example: 500.0, description: 'Tip amount in NGN' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 'Great service!', description: 'Optional message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ example: 'guest@example.com', description: 'Guest email (optional, falls back to guest@taktip.com)' })
  @IsOptional()
  @IsString()
  email?: string;
}

class InitiateGuestTipResponseDto {
  @ApiProperty({ example: 'https://checkout.paystack.com/abc123' })
  authorizationUrl: string;

  @ApiProperty({ example: 'TXT-1712345678901-a1b2c3d4' })
  reference: string;
}

// ───────── CONTROLLER ─────────

@ApiTags('payments')
@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  /**
   * POST /guest/tip
   *
   * Guest tip flow:
   * 1. Guest scans a QR code
   * 2. This endpoint resolves the QR code, creates a PENDING Tip and Payment,
   *    and initializes a checkout with the configured payment provider
   * 3. Returns the authorization URL to the frontend
   */
  @Post('guest/tip')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate a guest tip checkout',
    description:
      'Resolves a QR code, creates a PENDING tip and payment record, and returns a ' +
      'checkout URL from the configured payment provider. ' +
      'Redirect the guest to the authorizationUrl to complete payment.',
  })
  @ApiResponse({
    status: 200,
    description: 'Guest tip initiated — checkout URL returned',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string', example: 'https://checkout.paystack.com/abc123' },
            reference: { type: 'string', example: 'TXT-1712345678901-a1b2c3d4' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or QR code without staff assignment',
    schema: { type: 'object', properties: { status: { type: 'string', example: 'error' }, data: { type: 'null' } } },
  })
  @ApiResponse({ status: 404, description: 'QR code not found or inactive', type: ErrorResponseDto })
  async initiateGuestTip(
    @Body() dto: InitiateGuestTipDto,
  ): Promise<{ status: string; data: InitiateGuestTipResponseDto | null }> {
    // 1. Resolve QR code to get merchant and staff profile
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id: dto.qrCodeId, isActive: true },
    });

    if (!qrCode) {
      return {
        status: 'error',
        data: null,
      };
    }

    const { merchantId, staffProfileId } = qrCode;

    if (!staffProfileId) {
      return {
        status: 'error',
        data: null,
      };
    }

    // 2. Create a Tip record with PENDING status and GUEST source
    const tip = this.tipRepository.create({
      merchantId,
      staffProfileId,
      amount: dto.amount,
      currency: 'NGN',
      message: dto.message || null,
      source: TipSource.GUEST,
      tipStatus: TipStatus.PENDING,
      qrCodeId: dto.qrCodeId,
    } as Partial<Tip>);

    const savedTip = await this.tipRepository.save(tip);
    this.logger.log(`Tip ${savedTip.id} created (PENDING, ref qrCode: ${dto.qrCodeId})`);

    // 3. Initialize transaction with the configured payment provider
    const email = dto.email || 'guest@taktip.com';
    const result = await this.paymentProvider.initializeTransaction({
      email,
      amount: dto.amount,
      metadata: {
        tipId: savedTip.id,
        merchantId,
        staffProfileId,
        qrCodeId: dto.qrCodeId,
      },
    } as InitializeTransactionParams);

    // 4. Link the Payment to the Tip
    await this.paymentRepository.update(
      { reference: result.reference },
      { tipId: savedTip.id },
    );

    this.logger.log(
      `Guest tip initiated via ${this.paymentProvider.name}: ` +
        `tip=${savedTip.id}, payment=${result.reference}`,
    );

    return {
      status: 'success',
      data: {
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
      },
    };
  }

  /**
   * POST /payments/webhook
   *
   * Payment provider webhook receiver. No auth guards — the provider sends
   * these directly. Verifies the HMAC signature before processing the event.
   */
  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment provider webhook receiver',
    description:
      'Receives payment event notifications from the configured payment provider. ' +
      'Signature is verified via HMAC before processing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook received and processed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Signature verification failed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'signature verification failed' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Missing event or data in payload',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'invalid payload' },
      },
    },
  })
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    const rawBody = JSON.stringify(body);

    // Verify HMAC signature
    if (!signature || !this.paymentProvider.verifyWebhookSignature(signature, rawBody)) {
      this.logger.warn(
        `[${this.paymentProvider.name}] Webhook signature verification failed`,
      );
      return { status: 'signature verification failed' };
    }

    const event = body.event as string | undefined;
    const data = body.data;

    if (!event || !data) {
      this.logger.warn(`[${this.paymentProvider.name}] Webhook missing event or data`);
      return { status: 'invalid payload' };
    }

    this.logger.log(
      `[${this.paymentProvider.name}] Webhook received: ${event}`,
    );

    // Process the event through the configured provider
    await this.paymentProvider.handleWebhook(event, data as Record<string, unknown>);

    return { status: 'success' };
  }
}
