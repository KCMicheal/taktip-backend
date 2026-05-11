import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { StaffService, StaffDashboardDto, StaffSettingsDto } from './staff.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { PayoutMethodDto } from './dto/payout-method.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Response wrapper for dashboard endpoint
 */
class DashboardResponseDto {
  status: string;
  data: StaffDashboardDto;
}

/**
 * Response wrapper for settings endpoint
 */
class SettingsResponseDto {
  status: string;
  data: StaffSettingsDto;
}

/**
 * Response wrapper for message-only responses
 */
class MessageResponseDto {
  status: string;
  message: string;
}

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get staff dashboard',
    description:
      'Returns basic profile info, user details, and associated merchant for the authenticated staff member.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff dashboard data',
    type: DashboardResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async getDashboard(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<DashboardResponseDto> {
    const data = await this.staffService.getDashboard(user.sub, user.role);
    return { status: 'success', data };
  }

  @Get('settings')
  @ApiOperation({
    summary: 'Get staff settings',
    description:
      'Returns staff profile settings, payout method, and user details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff settings data',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async getSettings(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SettingsResponseDto> {
    const data = await this.staffService.getSettings(user.sub, user.role);
    return { status: 'success', data };
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Update staff settings',
    description:
      'Update display name, role tag, and notification preferences.',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async updateSettings(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    const data = await this.staffService.updateSettings(
      user.sub,
      user.role,
      dto,
    );
    return { status: 'success', data };
  }

  @Post('settings/payout-method')
  @ApiOperation({
    summary: 'Save payout method',
    description: 'Save or update bank account details for withdrawals.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payout method saved successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid account number' })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async savePayoutMethod(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: PayoutMethodDto,
  ): Promise<MessageResponseDto> {
    const result = await this.staffService.savePayoutMethod(
      user.sub,
      user.role,
      dto,
    );
    return { status: 'success', message: result.message };
  }
}
