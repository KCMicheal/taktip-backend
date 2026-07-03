import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Merchant } from '../merchant/entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Shift } from './entities/shift.entity';
import { ShiftStaff } from './entities/shift-staff.entity';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftStatus } from './enums/shift-status.enum';
import { ShiftStaffStatus } from './enums/shift-staff-status.enum';
import { PaginationService, PaginatedResult } from '../common/pagination';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/enums/notification-type.enum';

/**
 * Response shape for shift detail (includes assigned staff).
 */
export interface ShiftStaffDetailDto {
  id: string;
  staffProfileId: string;
  staffName: string | null;
  clockedInAt: Date | null;
  clockedOutAt: Date | null;
  tipsEarned: string | null;
  status: number;
}

export interface ShiftDetailDto {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: number;
  distributionPolicy: Record<string, unknown> | null;
  assignedStaff: ShiftStaffDetailDto[];
  createdAt: Date;
}

/**
 * Response shape for roster week view.
 */
export interface RosterDayDto {
  date: string; // ISO date YYYY-MM-DD
  shifts: Array<{
    id: string;
    name: string;
    startsAt: Date;
    endsAt: Date;
    status: number;
    staffCount: number;
    clockedInCount: number;
  }>;
}

/**
 * Service handling merchant-facing shift operations:
 * CRUD shifts, roster views, and staff assignment management.
 */
@Injectable()
export class MerchantShiftsService {
  private readonly logger = new Logger(MerchantShiftsService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(ShiftStaff)
    private readonly shiftStaffRepository: Repository<ShiftStaff>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    private readonly paginationService: PaginationService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Verify the authenticated user owns this merchant.
   */
  private async verifyMerchantOwnership(
    merchantId: string,
    userId: string,
  ): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to manage this merchant\'s shifts');
    }

    return merchant;
  }

  /**
   * Verify all staff profile IDs belong to the given merchant.
   * Throws BadRequestException if any staff profile does not belong to this merchant.
   */
  private async validateStaffProfilesBelongToMerchant(
    staffProfileIds: string[],
    merchantId: string,
  ): Promise<void> {
    const existing = await this.staffProfileRepository.find({
      where: { id: In(staffProfileIds), merchantId },
      select: ['id'],
    });

    if (existing.length !== staffProfileIds.length) {
      throw new BadRequestException(
        'One or more staff profiles do not belong to this merchant',
      );
    }
  }

  /**
   * GET /merchant/:merchantId/shifts
   * List shifts with optional status/date filtering.
   */
  async getShifts(
    merchantId: string,
    userId: string,
    status?: number,
    from?: string,
    to?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<Shift>> {
    await this.verifyMerchantOwnership(merchantId, userId);

    const queryBuilder = this.shiftRepository
      .createQueryBuilder('shift')
      .where('shift.merchantId = :merchantId', { merchantId });

    if (status) {
      queryBuilder.andWhere('shift.status = :status', { status });
    }
    if (from) {
      queryBuilder.andWhere('shift.startsAt >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('shift.endsAt <= :to', { to });
    }

    queryBuilder.orderBy('shift.startsAt', 'DESC');

    const skip = this.paginationService.getSkip(page, limit);
    const [items, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return this.paginationService.wrap(items, total, page, limit);
  }

  /**
   * GET /merchant/:merchantId/shifts/:id
   * Get shift detail including assigned staff and clock-in status.
   */
  async getShift(
    shiftId: string,
    merchantId: string,
    userId: string,
  ): Promise<ShiftDetailDto> {
    await this.verifyMerchantOwnership(merchantId, userId);

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, merchantId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Get assigned staff with clock-in status
    const assignments = await this.shiftStaffRepository.find({
      where: { shiftId },
      relations: ['staffProfile', 'staffProfile.user'],
    });

    const assignedStaff: ShiftStaffDetailDto[] = assignments.map((a) => ({
      id: a.shiftId + '-' + a.staffProfileId,
      staffProfileId: a.staffProfileId,
      staffName: a.staffProfile?.displayName
        || (a.staffProfile?.user
          ? `${a.staffProfile.user.firstName || ''} ${a.staffProfile.user.lastName || ''}`.trim() || null
          : null),
      clockedInAt: a.clockedInAt,
      clockedOutAt: a.clockedOutAt,
      tipsEarned: a.tipsEarned,
      status: a.status,
    }));

    return {
      id: shift.id,
      name: shift.name,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      status: shift.status,
      distributionPolicy: shift.distributionPolicy,
      assignedStaff,
      createdAt: shift.createdAt,
    };
  }

  /**
   * POST /merchant/:merchantId/shifts
   * Create a new shift with optional staff assignments.
   */
  async createShift(
    merchantId: string,
    userId: string,
    dto: CreateShiftDto,
  ): Promise<Shift> {
    await this.verifyMerchantOwnership(merchantId, userId);

    // Validate dates
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('Shift end time must be after start time');
    }

    // Create the shift
    const shift = this.shiftRepository.create({
      merchantId,
      name: dto.name,
      startsAt,
      endsAt,
      status: ShiftStatus.DRAFT,
      distributionPolicy: dto.distributionPolicy || null,
    });

    const savedShift = await this.shiftRepository.save(shift);

    // Assign staff if provided
    if (dto.staffProfileIds && dto.staffProfileIds.length > 0) {
      await this.validateStaffProfilesBelongToMerchant(dto.staffProfileIds, merchantId);

      const assignments = dto.staffProfileIds.map((staffProfileId) =>
        this.shiftStaffRepository.create({
          shiftId: savedShift.id,
          staffProfileId,
          status: ShiftStaffStatus.ASSIGNED,
        }),
      );
      await this.shiftStaffRepository.save(assignments);

      // Send shift assignment notifications (fire-and-forget)
      this.sendShiftAssignmentNotifications(
        savedShift,
        dto.staffProfileIds,
        merchantId,
      ).catch((err) => this.logger.warn(`Failed to send shift assignment notifications: ${err}`));
    }

    this.logger.log(`Shift "${dto.name}" created for merchant ${merchantId}`);

    return savedShift;
  }

  /**
   * PATCH /merchant/:merchantId/shifts/:id
   * Update shift properties, add/remove staff, or change status.
   */
  async updateShift(
    shiftId: string,
    merchantId: string,
    userId: string,
    dto: UpdateShiftDto,
  ): Promise<ShiftDetailDto> {
    await this.verifyMerchantOwnership(merchantId, userId);

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, merchantId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Cannot modify a completed or cancelled shift
    if (shift.status === ShiftStatus.COMPLETED || shift.status === ShiftStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot modify a completed or cancelled shift',
      );
    }

    // Update fields
    if (dto.name !== undefined) shift.name = dto.name;
    if (dto.startsAt !== undefined) shift.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) shift.endsAt = new Date(dto.endsAt);
    if (dto.status !== undefined) shift.status = dto.status as ShiftStatus;
    if (dto.distributionPolicy !== undefined) shift.distributionPolicy = dto.distributionPolicy;

    // Validate dates after update
    if (shift.endsAt <= shift.startsAt) {
      throw new BadRequestException('Shift end time must be after start time');
    }

    await this.shiftRepository.save(shift);

    // Add staff assignments
    if (dto.addStaffProfileIds && dto.addStaffProfileIds.length > 0) {
      await this.validateStaffProfilesBelongToMerchant(dto.addStaffProfileIds, merchantId);

      const newAssignments = dto.addStaffProfileIds.map((staffProfileId) =>
        this.shiftStaffRepository.create({
          shiftId: shift.id,
          staffProfileId,
          status: ShiftStaffStatus.ASSIGNED,
        }),
      );
      await this.shiftStaffRepository.save(newAssignments);

      // Send shift assignment notifications (fire-and-forget)
      this.sendShiftAssignmentNotifications(
        shift,
        dto.addStaffProfileIds,
        merchantId,
      ).catch((err) => this.logger.warn(`Failed to send shift assignment notifications: ${err}`));
    }

    // Remove staff assignments
    if (dto.removeStaffProfileIds && dto.removeStaffProfileIds.length > 0) {
      await this.shiftStaffRepository.delete({
        shiftId: shift.id,
        staffProfileId: In(dto.removeStaffProfileIds),
      });
    }

    return this.getShift(shiftId, merchantId, userId);
  }

  /**
   * DELETE /merchant/:merchantId/shifts/:id
   * Delete a shift. Only allowed for DRAFT or PUBLISHED shifts
   * that have no staff clocked in.
   */
  async deleteShift(
    shiftId: string,
    merchantId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.verifyMerchantOwnership(merchantId, userId);

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, merchantId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.status === ShiftStatus.COMPLETED || shift.status === ShiftStatus.CANCELLED) {
      throw new BadRequestException('Cannot delete a completed or cancelled shift');
    }

    // Check for any clocked-in staff
    const clockedInCount = await this.shiftStaffRepository.count({
      where: {
        shiftId,
        status: ShiftStaffStatus.CLOCKED_IN,
      },
    });

    if (clockedInCount > 0) {
      throw new BadRequestException(
        'Cannot delete a shift with staff currently clocked in. ' +
        'End the shift first or wait for all staff to clock out.',
      );
    }

    // Remove all assignments first
    await this.shiftStaffRepository.delete({ shiftId });

    // Delete the shift
    await this.shiftRepository.remove(shift);

    this.logger.log(`Shift ${shiftId} deleted for merchant ${merchantId}`);

    return { message: 'Shift deleted successfully' };
  }

  /**
   * GET /merchant/:merchantId/roster
   * Get the weekly roster/calendar view of shifts.
   */
  async getRoster(
    merchantId: string,
    userId: string,
    weekStart?: string,
  ): Promise<RosterDayDto[]> {
    await this.verifyMerchantOwnership(merchantId, userId);

    // Determine week boundaries
    const monday = weekStart
      ? new Date(weekStart)
      : this.getCurrentWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Get all shifts in the week
    const shifts = await this.shiftRepository.find({
      where: {
        merchantId,
      },
      order: { startsAt: 'ASC' },
    });

    // Filter to shifts within the week
    const weekShifts = shifts.filter((s) => {
      const t = s.startsAt.getTime();
      return t >= monday.getTime() && t <= sunday.getTime();
    });

    // For each shift, count assigned and clocked-in staff
    const shiftDetails = await Promise.all(
      weekShifts.map(async (shift) => {
        const staffCount = await this.shiftStaffRepository.count({
          where: { shiftId: shift.id },
        });

        const clockedInCount = await this.shiftStaffRepository.count({
          where: {
            shiftId: shift.id,
            status: ShiftStaffStatus.CLOCKED_IN,
          },
        });

        return {
          id: shift.id,
          name: shift.name,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          status: shift.status,
          staffCount,
          clockedInCount,
        };
      }),
    );

    // Group by day
    const dayMap = new Map<string, typeof shiftDetails>();
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dayMap.set(dateStr, []);
    }

    for (const detail of shiftDetails) {
      const dateStr = detail.startsAt.toISOString().split('T')[0];
      const day = dayMap.get(dateStr);
      if (day) {
        day.push(detail);
      }
    }

    return Array.from(dayMap.entries()).map(([date, shiftsData]) => ({
      date,
      shifts: shiftsData,
    }));
  }

  /**
   * POST /merchant/:merchantId/roster
   * Publish all DRAFT shifts in a given week, making them visible to staff.
   */
  async publishRoster(
    merchantId: string,
    userId: string,
    weekStart?: string,
  ): Promise<{ message: string; publishedCount: number }> {
    await this.verifyMerchantOwnership(merchantId, userId);

    const monday = weekStart
      ? new Date(weekStart)
      : this.getCurrentWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Find all DRAFT shifts in the week
    const draftShifts = await this.shiftRepository.find({
      where: {
        merchantId,
        status: ShiftStatus.DRAFT,
      },
    });

    const weekDrafts = draftShifts.filter((s) => {
      const t = s.startsAt.getTime();
      return t >= monday.getTime() && t <= sunday.getTime();
    });

    if (weekDrafts.length === 0) {
      return { message: 'No draft shifts to publish for this week', publishedCount: 0 };
    }

    // Publish all draft shifts
    for (const shift of weekDrafts) {
      shift.status = ShiftStatus.PUBLISHED;
      await this.shiftRepository.save(shift);
    }

    this.logger.log(`Published ${weekDrafts.length} shifts for merchant ${merchantId}`);

    return {
      message: `Published ${weekDrafts.length} shift(s) for the week`,
      publishedCount: weekDrafts.length,
    };
  }

  /**
   * Get the Monday of the current week at 00:00:00
   */
  private getCurrentWeekMonday(): Date {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Send shift assignment notifications to staff members.
   * Fire-and-forget — caller handles error logging.
   */
  private async sendShiftAssignmentNotifications(
    shift: Shift,
    staffProfileIds: string[],
    merchantId: string,
  ): Promise<void> {
    // Get merchant name for the notification
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
      select: ['name'],
    });

    const merchantName = merchant?.name || 'your merchant';

    for (const staffProfileId of staffProfileIds) {
      // Find the staff user
      const staffProfile = await this.staffProfileRepository.findOne({
        where: { id: staffProfileId },
        select: ['userId'],
      });

      if (!staffProfile?.userId) continue;

      const shiftDate = shift.startsAt.toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      await this.notificationService.create({
        userId: staffProfile.userId,
        type: NotificationType.SHIFT_ASSIGNED,
        title: 'You have been assigned to a shift',
        body: `You've been assigned to "${shift.name}" at ${merchantName} on ${shiftDate}`,
        data: {
          shiftId: shift.id,
          shiftName: shift.name,
          merchantId,
          merchantName,
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
        },
      });
    }
  }
}
