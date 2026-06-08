import {
  Controller,
  Get,
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
import { ShiftsService, ClockOutSummaryDto, PersonalShiftDto } from './shifts.service';
import { ClockInDto } from './dto/clock-in.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { ErrorResponseDto } from '../auth/dto/response.dto';

/**
 * Response wrapper for clock-in endpoint
 */
class ClockInResponseDto {
  status: string;
  data: {
    message: string;
    clockedInAt: Date;
    shiftName: string;
  };
}

/**
 * Response wrapper for clock-out endpoint
 */
class ClockOutResponseDto {
  status: string;
  data: ClockOutSummaryDto;
}

/**
 * Response wrapper for personal shifts list
 */
class PersonalShiftsResponseDto {
  status: string;
  data: PersonalShiftDto[];
}

/**
 * Response wrapper for schedule view
 */
class ScheduleResponseDto {
  status: string;
  data: PersonalShiftDto[];
}

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('staff')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('clock-in')
  @ApiOperation({
    summary: 'Clock in for a shift',
    description:
      'Clock in for an active shift. Validates the staff member is assigned ' +
      'to the shift and the shift is published or in-progress. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 201,
    description: 'Clocked in successfully',
    type: ClockInResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Already clocked in or invalid shift status', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied or not assigned to shift', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Shift or staff profile not found', type: ErrorResponseDto })
  async clockIn(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: ClockInDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<ClockInResponseDto> {
    const data = await this.shiftsService.clockIn(
      user.sub,
      user.role,
      dto,
      merchantId,
    );
    return { status: 'success', data };
  }

  @Post('clock-out')
  @ApiOperation({
    summary: 'Clock out from current shift',
    description:
      'Clock out from the active shift. Returns a summary including hours worked ' +
      'and tips earned. If the staff member belongs to multiple merchants, ' +
      'provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiResponse({
    status: 201,
    description: 'Clocked out successfully',
    type: ClockOutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Not currently clocked in', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Staff profile not found', type: ErrorResponseDto })
  async clockOut(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('merchantId') merchantId?: string,
  ): Promise<ClockOutResponseDto> {
    const data = await this.shiftsService.clockOut(
      user.sub,
      user.role,
      merchantId,
    );
    return { status: 'success', data };
  }

  @Get('shifts')
  @ApiOperation({
    summary: 'Get personal shift schedule',
    description:
      'Returns all assigned shifts for the authenticated staff member. ' +
      'Supports optional filtering by status and date range. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: Number,
    description: 'Filter by shift status (1=Draft, 2=Published, 3=InProgress, 4=Completed, 5=Cancelled)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Filter shifts starting from this date (ISO 8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Filter shifts ending before this date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Personal shift schedule',
    type: PersonalShiftsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Staff profile not found', type: ErrorResponseDto })
  async getPersonalShifts(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<PersonalShiftsResponseDto> {
    const data = await this.shiftsService.getPersonalShifts(
      user.sub,
      user.role,
      merchantId,
      status ? Number(status) : undefined,
      from,
      to,
    );
    return { status: 'success', data };
  }

  @Get('schedule')
  @ApiOperation({
    summary: 'Get calendar view of assigned shifts',
    description:
      'Returns a week-based calendar view of assigned shifts. ' +
      'Defaults to the current week. ' +
      'If the staff member belongs to multiple merchants, provide merchantId to disambiguate.',
  })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Merchant ID to scope the request (required if staff belongs to multiple merchants)',
  })
  @ApiQuery({
    name: 'weekStart',
    required: false,
    type: String,
    description: 'Start date of the week (Monday, ISO format: YYYY-MM-DD). Defaults to current week.',
  })
  @ApiResponse({
    status: 200,
    description: 'Weekly calendar view',
    type: ScheduleResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Access denied', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Staff profile not found', type: ErrorResponseDto })
  async getSchedule(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('merchantId') merchantId?: string,
    @Query('weekStart') weekStart?: string,
  ): Promise<ScheduleResponseDto> {
    const data = await this.shiftsService.getSchedule(
      user.sub,
      user.role,
      merchantId,
      weekStart,
    );
    return { status: 'success', data };
  }
}
