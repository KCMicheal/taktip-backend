import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import {
  WalletService,
  StaffConsolidatedWalletsDto,
  TransactionsListDto,
} from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Generic success response wrapper
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('Staff Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/wallet')
export class StaffWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get consolidated staff wallet view across all merchants' })
  @ApiResponse({ status: 200, description: 'Consolidated wallet view' })
  async getMyWallets(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<StaffConsolidatedWalletsDto>> {
    const data = await this.walletService.getStaffConsolidatedWallets(user);
    return { status: 'success', data };
  }

  @Get(':walletId/transactions')
  @ApiOperation({ summary: 'List transactions for a specific staff wallet' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getWalletTransactions(
    @Param('walletId') walletId: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SuccessResponseDto<TransactionsListDto>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const data = await this.walletService.getTransactions(walletId, user, {
      page: pageNum,
      limit: limitNum,
    });
    return { status: 'success', data };
  }
}
