import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { CustomerService } from './customer.service';
import { CustomerActivityService } from './services/customer-activity.service';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateCustomerPreferencesDto } from './dto/update-customer-preferences.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';

@ApiTags('customer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly activityService: CustomerActivityService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  //  Profile
  // ─────────────────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get the authenticated customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile returned' })
  @ApiResponse({ status: 404, description: 'Customer profile not found' })
  async getProfile(@CurrentUser() user: { sub: string }) {
    const profile = await this.customerService.getByUserId(user.sub);
    return {
      status: 'success',
      data: {
        id: profile.id,
        displayName: profile.displayName,
        avatar: profile.avatar,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        phone: profile.user.phone,
        isTwoFactorEnabled: profile.user.isTwoFactorEnabled,
        notificationPreferences: profile.notificationPreferences,
        preferences: profile.preferences,
        paymentMethods: profile.paymentMethods,
      },
    };
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update customer profile (displayName, avatar)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateProfile(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    const profile = await this.customerService.updateProfile(user.sub, dto);
    return {
      status: 'success',
      data: {
        id: profile.id,
        displayName: profile.displayName,
        avatar: profile.avatar,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        phone: profile.user.phone,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  Notification Preferences
  // ─────────────────────────────────────────────────────────────

  @Patch('profile/notifications')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateNotificationPreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const prefs = await this.customerService.updateNotificationPreferences(
      user.sub,
      { ...dto },
    );
    return { status: 'success', data: prefs };
  }

  // ─────────────────────────────────────────────────────────────
  //  General Preferences
  // ─────────────────────────────────────────────────────────────

  @Patch('profile/preferences')
  @ApiOperation({ summary: 'Update customer preferences (language, currency, timezone)' })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateCustomerPreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateCustomerPreferencesDto,
  ) {
    const prefs = await this.customerService.updatePreferences(
      user.sub,
      { ...dto },
    );
    return { status: 'success', data: prefs };
  }

  // ─────────────────────────────────────────────────────────────
  //  Payment Methods
  // ─────────────────────────────────────────────────────────────

  @Post('profile/payment-methods')
  @ApiOperation({ summary: 'Add a new payment method' })
  @ApiResponse({ status: 201, description: 'Payment method added' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async addPaymentMethod(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreatePaymentMethodDto,
  ) {
    const method = await this.customerService.addPaymentMethod(user.sub, dto);
    return { status: 'success', data: method };
  }

  @Delete('profile/payment-methods/:id')
  @ApiOperation({ summary: 'Delete a saved payment method' })
  @ApiResponse({ status: 200, description: 'Payment method deleted' })
  @ApiResponse({ status: 404, description: 'Payment method not found' })
  async deletePaymentMethod(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    await this.customerService.deletePaymentMethod(user.sub, id);
    return { status: 'success', data: { message: 'Payment method deleted successfully' } };
  }

  // ─────────────────────────────────────────────────────────────
  //  Payment Methods (Read)
  // ─────────────────────────────────────────────────────────────

  @Get('profile/payment-methods')
  @ApiOperation({ summary: 'Get saved payment methods (bank name and account number)' })
  @ApiResponse({ status: 200, description: 'List of saved payment methods' })
  async getPaymentMethods(@CurrentUser() user: { sub: string }) {
    const methods = await this.customerService.getPaymentMethods(user.sub);
    return { status: 'success', data: methods };
  }

  // ─────────────────────────────────────────────────────────────
  //  Activity Feed
  // ─────────────────────────────────────────────────────────────

  @Get('activity')
  @ApiOperation({
    summary: 'Get unified customer activity feed',
    description:
      'Returns a chronological feed of all customer activity: tips sent/received, deposits, withdrawals, transfers, and fees.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'tips', 'wallet'], description: 'Filter by activity source (default: all)' })
  @ApiQuery({ name: 'period', required: false, enum: ['all', '7d', '30d', '90d'], description: 'Filter by time period (default: all)' })
  @ApiResponse({ status: 200, description: 'Paginated activity feed' })
  async getActivity(
    @CurrentUser() user: { sub: string },
    @Query() query: ActivityQueryDto,
  ) {
    const results = await this.activityService.getActivity(user.sub, query);
    return { status: 'success', data: results };
  }
}
