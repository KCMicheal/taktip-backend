import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { MerchantShiftsService, ShiftDetailDto, RosterDayDto } from './merchant-shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import { Shift } from './entities/shift.entity';
import { PaginatedResult } from '../common/pagination';

/**
 * Response wrapper for shift list
 */
class ShiftListResponseDto {
  status: string;
  data: PaginatedResult<Shift>;
}

/**
 * Response wrapper for single shift
 */
class ShiftDetailResponseDto {
  status: string;
  data: ShiftDetailDto;
}

/**
 * Response wrapper for create/update
 */
class ShiftResponseDto {
  status: string;
  data: Shift;
}

/**
 * Response wrapper for roster view
 */
class RosterResponseDto {
  status: string;
  data: RosterDayDto[];
}

/**
 * Response wrapper for simple message
 */
class MessageResponseDto {
  status: string;
  message: string;
}

@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchant')
export class MerchantShiftsController {
  constructor(
    private readonly merchantShiftsService: MerchantShiftsService,
  ) {}

  @Get(':merchantId/shifts')
  @ApiOperation({
    summary: 'List shifts for a merchant',
    description:
      'Returns a paginated list of shifts for this merchant. ' +
      'Supports optional filtering by status and date range. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiQuery({ name: 'status', required: false, type: Number, description: 'Filter by shift status (1=Draft, 2=Published, 3=InProgress, 4=Completed, 5=Cancelled)' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Filter shifts starting from this date (ISO 8601)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Filter shifts ending before this date (ISO 8601)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of shifts',
    type: ShiftListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async getShifts(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
    @Query('status') status?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<ShiftListResponseDto> {
    const data = await this.merchantShiftsService.getShifts(
      merchantId,
      user.sub,
      status ? Number(status) : undefined,
      from,
      to,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return { status: 'success', data };
  }

  @Get(':merchantId/shifts/:id')
  @ApiOperation({
    summary: 'Get shift detail',
    description:
      'Returns shift details including assigned staff, clock-in/out times, ' +
      'and tip distribution preview. Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiParam({ name: 'id', description: 'Shift UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shift detail with staff assignments',
    type: ShiftDetailResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Shift or merchant not found', type: ErrorResponseDto })
  async getShift(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<ShiftDetailResponseDto> {
    const data = await this.merchantShiftsService.getShift(
      id,
      merchantId,
      user.sub,
    );
    return { status: 'success', data };
  }

  @Post(':merchantId/shifts')
  @ApiOperation({
    summary: 'Create a new shift',
    description:
      'Creates a new shift in DRAFT status and optionally assigns staff. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiBody({ type: CreateShiftDto })
  @ApiResponse({
    status: 201,
    description: 'Shift created successfully',
    type: ShiftResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid shift data (e.g., end time before start time)', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async createShift(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: CreateShiftDto,
    @CurrentUser() user: { sub: string },
  ): Promise<ShiftResponseDto> {
    const data = await this.merchantShiftsService.createShift(
      merchantId,
      user.sub,
      dto,
    );
    return { status: 'success', data };
  }

  @Patch(':merchantId/shifts/:id')
  @ApiOperation({
    summary: 'Update a shift',
    description:
      'Update shift properties, add/remove staff, or change status. ' +
      'Cannot modify completed or cancelled shifts. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiParam({ name: 'id', description: 'Shift UUID' })
  @ApiBody({ type: UpdateShiftDto })
  @ApiResponse({
    status: 200,
    description: 'Shift updated successfully',
    type: ShiftDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid update data or shift is completed/cancelled', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Shift or merchant not found', type: ErrorResponseDto })
  async updateShift(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() user: { sub: string },
  ): Promise<ShiftDetailResponseDto> {
    const data = await this.merchantShiftsService.updateShift(
      id,
      merchantId,
      user.sub,
      dto,
    );
    return { status: 'success', data };
  }

  @Delete(':merchantId/shifts/:id')
  @ApiOperation({
    summary: 'Delete a shift',
    description:
      'Delete a shift. Only allowed for DRAFT or PUBLISHED shifts ' +
      'that have no staff currently clocked in. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiParam({ name: 'id', description: 'Shift UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shift deleted successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot delete shift with clocked-in staff', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Shift or merchant not found', type: ErrorResponseDto })
  async deleteShift(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<MessageResponseDto> {
    const result = await this.merchantShiftsService.deleteShift(
      id,
      merchantId,
      user.sub,
    );
    return { status: 'success', message: result.message };
  }

  @Get(':merchantId/roster')
  @ApiOperation({
    summary: 'Get weekly roster',
    description:
      'Returns a day-by-day calendar view of all shifts for a given week. ' +
      'Defaults to the current week. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiQuery({
    name: 'weekStart',
    required: false,
    type: String,
    description: 'Start date of the week (Monday, ISO format: YYYY-MM-DD). Defaults to current week.',
  })
  @ApiResponse({
    status: 200,
    description: 'Weekly roster view',
    type: RosterResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async getRoster(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
    @Query('weekStart') weekStart?: string,
  ): Promise<RosterResponseDto> {
    const data = await this.merchantShiftsService.getRoster(
      merchantId,
      user.sub,
      weekStart,
    );
    return { status: 'success', data };
  }

  @Post(':merchantId/roster')
  @ApiOperation({
    summary: 'Publish roster week',
    description:
      'Publishes all DRAFT shifts in the given week, making them visible to assigned staff. ' +
      'Defaults to the current week. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiQuery({
    name: 'weekStart',
    required: false,
    type: String,
    description: 'Start date of the week (Monday, ISO format: YYYY-MM-DD). Defaults to current week.',
  })
  @ApiResponse({
    status: 201,
    description: 'Roster published',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not authorized', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async publishRoster(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
    @Query('weekStart') weekStart?: string,
  ): Promise<MessageResponseDto> {
    const result = await this.merchantShiftsService.publishRoster(
      merchantId,
      user.sub,
      weekStart,
    );
    return { status: 'success', message: result.message };
  }
}
