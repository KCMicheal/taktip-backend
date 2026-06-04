import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ErrorResponseDto } from '../auth/dto/response.dto';

/** Shape returned by Paystack's GET /bank/resolve endpoint. */
interface PaystackResolveResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id?: number;
  };
}

/**
 * Response shape for a successfully resolved bank account.
 */
class ResolveBankResponseDto {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

@ApiTags('bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bank')
export class BankController {
  private readonly logger = new Logger(BankController.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.paystackSecretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
    this.paystackBaseUrl = 'https://api.paystack.co';
  }

  @Get('resolve')
  @ApiOperation({
    summary: 'Resolve a bank account number',
    description:
      'Proxies Paystack\'s /bank/resolve endpoint. Given an account number ' +
      'and bank code, returns the account name if the account is valid.',
  })
  @ApiQuery({ name: 'accountNumber', required: true, example: '0022728151', description: 'Bank account number' })
  @ApiQuery({ name: 'bankCode', required: true, example: '063', description: 'Bank code (from List Banks endpoint)' })
  @ApiResponse({
    status: 200,
    description: 'Account resolved successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            accountName: { type: 'string', example: 'Wes Gibbons' },
            accountNumber: { type: 'string', example: '0022728151' },
            bankCode: { type: 'string', example: '063' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid account number or bank code', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ErrorResponseDto })
  async resolveBankAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ): Promise<{ status: string; data: ResolveBankResponseDto }> {
    if (!accountNumber || !bankCode) {
      throw new HttpException(
        { status: 'error', data: null, message: 'accountNumber and bankCode are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.paystackSecretKey) {
      this.logger.error('PAYSTACK_SECRET_KEY is not configured');
      throw new HttpException(
        { status: 'error', data: null, message: 'Payment service not configured' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url = `${this.paystackBaseUrl}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;

    this.logger.log(`Resolving bank account: ${accountNumber} (bank: ${bankCode})`);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Paystack bank resolve network error: ${message}`);
      throw new HttpException(
        { status: 'error', data: null, message: 'Failed to resolve bank account' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const body = (await response.json()) as PaystackResolveResponse;

    if (!response.ok || !body.status) {
      const paystackMessage = body.message || 'Bank account could not be resolved';
      this.logger.warn(`Paystack bank resolve failed: ${paystackMessage}`);
      throw new HttpException(
        { status: 'error', data: null, message: paystackMessage },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      status: 'success',
      data: {
        accountName: body.data.account_name,
        accountNumber: body.data.account_number,
        bankCode,
      },
    };
  }
}
