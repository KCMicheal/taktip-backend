import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { CustomerService } from './customer.service';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';

@ApiTags('customer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get the authenticated customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile returned' })
  @ApiResponse({ status: 404, description: 'Customer profile not found' })
  async getProfile(
    @CurrentUser() user: { sub: string },
  ) {
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
}
