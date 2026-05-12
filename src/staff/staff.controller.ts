import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
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
import { StaffService, StaffDashboardDto, StaffSettingsDto, StaffProfilesListDto } from './staff.service';
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
 * Response wrapper for profiles list endpoint
 */
class ProfilesListResponseDto {
  status: string;
  data: StaffProfilesListDto;
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

  @Get('profiles')
  @ApiOperation({
    summary: 'List all staff profiles',
    description:
      'Returns all merchant profiles for the authenticated staff member. ' +
      'Use this to enumerate which merchants the staff belongs to, then pass ' +
      'the desired merchantId to other endpoints.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of staff profiles',
    type: ProfilesListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  async getProfiles(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<ProfilesListResponseDto> {
    const data = await this.staffService.getProfilesList(user.sub, user.role);
    return { status: 'success', data };
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get staff dashboard',
    description:
      'Returns basic profile info, user details, and associated merchant ' +
      'for the authenticated staff member. If the staff member belongs to ' +
      'multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff dashboard data',
    type: DashboardResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Multiple profiles found — merchantId required' })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async getDashboard(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('merchantId') merchantId?: string,
  ): Promise<DashboardResponseDto> {
    const data = await this.staffService.getDashboard(user.sub, user.role, merchantId);
    return { status: 'success', data };
  }

  @Get('settings')
  @ApiOperation({
    summary: 'Get staff settings',
    description:
      'Returns staff profile settings, payout method, and user details. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff settings data',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Multiple profiles found — merchantId required' })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async getSettings(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('merchantId') merchantId?: string,
  ): Promise<SettingsResponseDto> {
    const data = await this.staffService.getSettings(user.sub, user.role, merchantId);
    return { status: 'success', data };
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Update staff settings',
    description:
      'Update display name, role tag, and notification preferences. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Multiple profiles found — merchantId required' })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async updateSettings(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: UpdateSettingsDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<SettingsResponseDto> {
    const data = await this.staffService.updateSettings(
      user.sub,
      user.role,
      dto,
      merchantId,
    );
    return { status: 'success', data };
  }

  @Post('settings/payout-method')
  @ApiOperation({
    summary: 'Save payout method',
    description:
      'Save or update bank account details for withdrawals. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 201,
    description: 'Payout method saved successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid account number or multiple profiles — merchantId required' })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async savePayoutMethod(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: PayoutMethodDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<MessageResponseDto> {
    const result = await this.staffService.savePayoutMethod(
      user.sub,
      user.role,
      dto,
      merchantId,
    );
    return { status: 'success', message: result.message };
  }
}
