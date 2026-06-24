import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { PayoutService } from './payouts.service';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { Payout } from './entities/payout.entity';
import { PayoutStatus } from './enums/payout-status.enum';
import { ErrorResponseDto } from '../auth/dto/response.dto';

/**
 * Generic success response wrapper
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('payouts')
@ApiBearerAuth()
@ApiExtraModels(PayoutResponseDto)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/payouts')
export class StaffPayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post()
  @ApiOperation({ summary: 'Request a payout from available wallet balance' })
  @ApiResponse({
    status: 201,
    description: 'Payout requested successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: { $ref: '#/components/schemas/PayoutResponseDto' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No payout method configured or insufficient balance', type: ErrorResponseDto })
  async requestPayout(
    @CurrentUser() user: { sub: string },
    @Body() dto: RequestPayoutDto,
  ): Promise<SuccessResponseDto<PayoutResponseDto>> {
    const payout = await this.payoutService.requestPayout(user.sub, dto.amount);
    return { status: 'success', data: this.toResponseDto(payout) };
  }

  @Get()
  @ApiOperation({ summary: 'List my payout requests' })
  @ApiResponse({
    status: 200,
    description: 'List of payout requests for the authenticated user',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              amount: { type: 'number', example: 5000 },
              fee: { type: 'number', example: 50 },
              netAmount: { type: 'number', example: 4950 },
              status: { type: 'string', example: 'PENDING' },
              reference: { type: 'string', example: 'POUT-1712345678-abcd1234' },
              processedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getMyPayouts(
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<PayoutResponseDto[]>> {
    const payouts = await this.payoutService.getMyPayouts(user.sub);
    return { status: 'success', data: payouts.map((p) => this.toResponseDto(p)) };
  }

  private toResponseDto(payout: Payout): PayoutResponseDto {
    return {
      id: payout.id,
      amount: Number(payout.amount),
      fee: Number(payout.fee),
      netAmount: Number(payout.netAmount),
      status: PayoutStatus[payout.payoutStatus],
      reference: payout.reference,
      processedAt: payout.processedAt ?? undefined,
      createdAt: payout.createdAt,
    };
  }
}
