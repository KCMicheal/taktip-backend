import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PayoutService } from './payouts.service';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get()
  @ApiOperation({ summary: 'List all payouts (optionally filtered by status)' })
  @ApiQuery({
    name: 'status',
    required: false,
    type: Number,
    description: 'Filter by payout status (1=PENDING, 2=APPROVED, 3=PROCESSING, 4=COMPLETED, 5=FAILED, 6=REJECTED)',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'List of payouts',
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
  async getAllPayouts(
    @Query('status') status?: string,
  ): Promise<SuccessResponseDto<PayoutResponseDto[]>> {
    let statusFilter: PayoutStatus | undefined;

    if (status !== undefined) {
      const parsed = parseInt(status, 10);
      if (!isNaN(parsed) && Object.values(PayoutStatus).includes(parsed)) {
        statusFilter = parsed as PayoutStatus;
      }
    }

    const payouts = await this.payoutService.getAllPayouts(statusFilter);
    return { status: 'success', data: payouts.map((p) => this.toResponseDto(p)) };
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a pending payout' })
  @ApiResponse({
    status: 200,
    description: 'Payout approved and queued for processing',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            amount: { type: 'number', example: 5000 },
            fee: { type: 'number', example: 50 },
            netAmount: { type: 'number', example: 4950 },
            status: { type: 'string', example: 'APPROVED' },
            reference: { type: 'string', example: 'POUT-1712345678-abcd1234' },
            processedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Payout is not in PENDING status', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Payout not found', type: ErrorResponseDto })
  async approvePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<PayoutResponseDto>> {
    const payout = await this.payoutService.approvePayout(id, user.sub);
    return { status: 'success', data: this.toResponseDto(payout) };
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a pending payout' })
  @ApiResponse({
    status: 200,
    description: 'Payout rejected and balance reversed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            amount: { type: 'number', example: 5000 },
            fee: { type: 'number', example: 50 },
            netAmount: { type: 'number', example: 4950 },
            status: { type: 'string', example: 'REJECTED' },
            reference: { type: 'string', example: 'POUT-1712345678-abcd1234' },
            processedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Payout is not in PENDING status', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Payout not found', type: ErrorResponseDto })
  async rejectPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: RejectPayoutDto,
  ): Promise<SuccessResponseDto<PayoutResponseDto>> {
    const payout = await this.payoutService.rejectPayout(id, user.sub, dto.notes);
    return { status: 'success', data: this.toResponseDto(payout) };
  }

  @Patch(':id/escalate')
  @ApiOperation({ summary: 'Escalate a payout — mark for manual intervention' })
  @ApiResponse({
    status: 200,
    description: 'Payout escalated',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            amount: { type: 'number', example: 5000 },
            fee: { type: 'number', example: 50 },
            netAmount: { type: 'number', example: 4950 },
            status: { type: 'string', example: 'ESCALATED' },
            reference: { type: 'string', example: 'POUT-1712345678-abcd1234' },
            processedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Payout cannot be escalated from its current status', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Payout not found', type: ErrorResponseDto })
  async escalatePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<PayoutResponseDto>> {
    const payout = await this.payoutService.escalatePayout(id, user.sub);
    return { status: 'success', data: this.toResponseDto(payout) };
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
