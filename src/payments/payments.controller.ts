import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  Req,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
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
import {
  PaymentProvider,
  InitializeTransactionParams,
} from './providers/interfaces/payment-provider.interface';
import { PAYMENT_PROVIDER } from './providers/providers.constants';
import { QrCode } from '../qrcodes/entities/qrcode.entity';
import { Tip } from '../tips/entities/tip.entity';
import { TipSource } from '../tips/enums/tip-source.enum';
import { TipStatus } from '../tips/enums/tip-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { Payment } from './entities/payment.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';

// ───────── DTOs ─────────

class InitiateGuestTipDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'QR code UUID (required for QR-code flow)' })
  @IsOptional()
  @IsUUID()
  qrCodeId?: string;

  @ApiPropertyOptional({ description: 'Merchant UUID (required for merchant-link flow)' })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Staff profile UUID (required for merchant-link flow)' })
  @IsOptional()
  @IsUUID()
  staffProfileId?: string;

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
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
  ) {}

  /**
   * GET /tip/:qrCode
   *
   * Resolve a QR code short code to checkout page data (enriched).
   * Delegates to the QR codes resolution endpoint pattern.
   */
  @Get('tip/:qrCode')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve QR code short code for checkout' })
  @ApiResponse({ status: 200, description: 'QR code resolved' })
  @ApiResponse({ status: 404, description: 'QR code not found' })
  async resolveTipQrCode(@Param('qrCode') qrCode: string) {
    const qrCodeEntity = await this.qrCodeRepository.findOne({
      where: { shortCode: qrCode, isActive: true },
    });

    if (!qrCodeEntity) {
      throw new NotFoundException('QR code not found or inactive');
    }

    // Look up staff display name
    let staffName: string | null = null;
    if (qrCodeEntity.staffProfileId) {
      const staffProfile = await this.staffProfileRepository.findOne({
        where: { id: qrCodeEntity.staffProfileId },
        relations: ['user'],
      });
      if (staffProfile) {
        staffName = staffProfile.displayName || staffProfile.user?.firstName || null;
      }
    }

    return {
      status: 'success',
      data: {
        qrCodeId: qrCodeEntity.id,
        merchantId: qrCodeEntity.merchantId,
        staffProfileId: qrCodeEntity.staffProfileId,
        staffName,
      },
    };
  }

  /**
   * POST /tip/:qrCode/pay
   *
   * Initiate a guest tip checkout using a QR code short code in the URL.
   * This is an alias for Path A of /guest/tip that makes the QR code
   * part of the URL path instead of the request body.
   */
  @Post('tip/:qrCode/pay')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate a guest tip checkout via QR code URL param',
    description:
      'Like POST /guest/tip but the QR code short code is in the URL path' +
      '({ amount, message?, email? }). The old /guest/tip endpoint remains functional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Checkout URL returned',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string' },
            reference: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'QR code not found or inactive' })
  async initiateTipPay(
    @Param('qrCode') qrCode: string,
    @Body() dto: InitiateGuestTipDto,
  ) {
    // Resolve QR code from URL param, then delegate to the shared logic
    const qrCodeEntity = await this.qrCodeRepository.findOne({
      where: { shortCode: qrCode, isActive: true },
    });

    if (!qrCodeEntity || !qrCodeEntity.staffProfileId) {
      throw new NotFoundException('QR code not found or inactive');
    }

    // Delegate to the existing guest tip flow by setting qrCodeId
    dto.qrCodeId = qrCodeEntity.id;
    return this.initiateGuestTip(dto);
  }

  /**
   * GET /tip/:qrCode/success
   *
   * Polling endpoint for the guest tip checkout.  After Paystack redirects
   * the user back to the app, the front-end calls this with the reference
   * to check whether the payment succeeded.
   *
   * Returns the tip status so the UI can show a success / failure screen.
   */
  @Get('tip/:qrCode/success')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Poll tip payment status after redirect',
    description:
      'Front-end calls this after Paystack redirects the user.  ' +
      'Uses the payment reference to look up the tip status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tip status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            tipStatus: { type: 'string', example: 'COMPLETED' },
            paymentStatus: { type: 'string', example: 'SUCCESS' },
            amount: { type: 'number', example: 500 },
            reference: { type: 'string', example: 'TXT-1712345678901-a1b2c3d4' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async pollTipSuccess(
    @Param('qrCode') _qrCode: string,
    @Query('reference') reference: string,
  ) {
    if (!reference) {
      return { status: 'error', message: 'Reference query parameter is required' };
    }

    const payment = await this.paymentRepository.findOne({
      where: { reference },
    });

    if (!payment) {
      return { status: 'error', message: 'Payment not found' };
    }

    // If the payment has a tipId, look up the tip status
    let tipStatus: string | null = null;
    if (payment.tipId) {
      const tip = await this.tipRepository.findOne({
        where: { id: payment.tipId },
      });
      if (tip) {
        tipStatus = TipStatus[tip.tipStatus];
      }
    }

    return {
      status: 'success',
      data: {
        tipStatus,
        paymentStatus: PaymentStatus[payment.paymentStatus],
        amount: Number(payment.amount),
        reference: payment.reference,
      },
    };
  }

  /**
   * POST /guest/tip
   *
   * Guest tip flow — supports TWO entry paths:
   *
   * Path A — QR code flow (guest scans a staff QR code):
   *   { qrCodeId, amount, message?, email? }
   *
   * Path B — Merchant-link flow (guest lands on /tip/{merchantShortCode}):
   *   { merchantId, staffProfileId, amount, message?, email? }
   *
   * Both paths create a PENDING Tip + Payment and return a checkout URL.
   */
  @Post('guest/tip')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate a guest tip checkout',
    description:
      'Supports two payload shapes: (1) { qrCodeId, amount } for QR-code flow, ' +
      'or (2) { merchantId, staffProfileId, amount } for merchant-link flow. ' +
      'Creates a PENDING tip and payment record, then returns a checkout URL ' +
      'from the configured payment provider.',
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
    status: 200,
    description: 'Invalid payload — neither QR-code nor merchant-link fields provided',
    schema: { type: 'object', properties: { status: { type: 'string', example: 'error' }, data: { type: 'null' } } },
  })
  async initiateGuestTip(
    @Body() dto: InitiateGuestTipDto,
  ): Promise<{ status: string; data: InitiateGuestTipResponseDto | null }> {
    // ── Resolve merchant and staff profile from either payload shape ──
    let merchantId: string;
    let staffProfileId: string;
    let qrCodeId: string | null = null;
    let sourceLabel: string;

    if (dto.qrCodeId) {
      // ── Path A: QR-code flow ──
      const qrCode = await this.qrCodeRepository.findOne({
        where: { id: dto.qrCodeId, isActive: true },
      });

      if (!qrCode || !qrCode.staffProfileId) {
        return { status: 'error', data: null };
      }

      merchantId = qrCode.merchantId;
      staffProfileId = qrCode.staffProfileId;
      qrCodeId = dto.qrCodeId;
      sourceLabel = `qrCode: ${dto.qrCodeId}`;
    } else if (dto.merchantId && dto.staffProfileId) {
      // ── Path B: Merchant-link flow ──
      // Verify the staff profile exists and belongs to the given merchant
      const profile = await this.staffProfileRepository.findOne({
        where: { id: dto.staffProfileId, merchantId: dto.merchantId },
      });

      if (!profile) {
        return { status: 'error', data: null };
      }

      merchantId = dto.merchantId;
      staffProfileId = dto.staffProfileId;
      sourceLabel = `merchant: ${dto.merchantId}, staff: ${dto.staffProfileId}`;
    } else {
      // Neither shape was provided
      return { status: 'error', data: null };
    }

    // ── Create a Tip record with PENDING status and GUEST source ──
    const tip = this.tipRepository.create({
      merchantId,
      staffProfileId,
      amount: dto.amount,
      currency: 'NGN',
      message: dto.message || null,
      source: TipSource.GUEST,
      tipStatus: TipStatus.PENDING,
      qrCodeId,
    } as Partial<Tip>);

    const savedTip = await this.tipRepository.save(tip);
    this.logger.log(`Tip ${savedTip.id} created (PENDING, ${sourceLabel})`);

    // ── Initialize transaction with the configured payment provider ──
    const email = dto.email || 'guest@taktip.com';
    const result = await this.paymentProvider.initializeTransaction({
      email,
      amount: dto.amount,
      metadata: {
        tipId: savedTip.id,
        merchantId,
        staffProfileId,
        qrCodeId,
      },
    } as InitializeTransactionParams);

    // ── Link the Payment to the Tip ──
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
    @Req() req: Request,
  ): Promise<{ status: string }> {
    // Use the raw request body for signature verification (byte-for-byte match with Paystack)
    const rawBody = ((req as unknown as { rawBody?: Buffer }).rawBody)?.toString() || JSON.stringify(body);

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
