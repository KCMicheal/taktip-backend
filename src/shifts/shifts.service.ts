import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Shift } from './entities/shift.entity';
import { ShiftStaff } from './entities/shift-staff.entity';
import { ClockInDto } from './dto/clock-in.dto';
import { Role } from '../auth/enums/role.enum';
import { ShiftStatus } from './enums/shift-status.enum';
import { ShiftStaffStatus } from './enums/shift-staff-status.enum';

/**
 * Interface for a clock-out response summary
 */
export interface ClockOutSummaryDto {
  shiftId: string;
  shiftName: string;
  clockedInAt: Date;
  clockedOutAt: Date;
  hoursWorked: number;
  tipsEarned: string | null;
}

/**
 * Interface for a personal shift summary
 */
export interface PersonalShiftDto {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: number;
  clockedInAt: Date | null;
  clockedOutAt: Date | null;
}

/**
 * Service handling staff-facing shift operations:
 * clock-in, clock-out, personal schedule, and calendar view.
 */
@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(ShiftStaff)
    private readonly shiftStaffRepository: Repository<ShiftStaff>,
  ) {}

  /**
   * Ensure the authenticated user has STAFF role
   */
  private assertStaffRole(userRole: Role): void {
    if (userRole !== Role.STAFF) {
      throw new ForbiddenException('Access denied: Staff role required');
    }
  }

  /**
   * Find a staff profile by user ID and optional merchant ID.
   *
   * - If merchantId is provided, finds the unique (user, merchant) pair.
   * - If merchantId is omitted and the user has exactly one profile, returns it.
   * - If merchantId is omitted and the user has multiple profiles, throws 400
   *   (the caller must disambiguate with merchantId).
   */
  private async getProfile(
    userId: string,
    merchantId?: string,
  ): Promise<StaffProfile> {
    if (merchantId) {
      const profile = await this.staffProfileRepository.findOne({
        where: { userId, merchantId },
        relations: ['user', 'merchant'],
      });

      if (!profile) {
        throw new NotFoundException('Staff profile not found for this merchant');
      }

      return profile;
    }

    // No merchantId — try single-profile fallback
    const profiles = await this.staffProfileRepository.find({
      where: { userId },
      relations: ['user', 'merchant'],
    });

    if (profiles.length === 0) {
      throw new NotFoundException('Staff profile not found');
    }

    if (profiles.length > 1) {
      throw new BadRequestException(
        'Multiple staff profiles found. Please provide merchantId query parameter.',
      );
    }

    return profiles[0];
  }

  /**
   * POST /staff/clock-in
   * Clock in for an active shift.
   *
   * Validates:
   * - Staff is assigned to the shift
   * - Shift is in PUBLISHED or IN_PROGRESS status
   * - Staff is not already clocked in
   */
  async clockIn(
    userId: string,
    userRole: Role,
    dto: ClockInDto,
    merchantId?: string,
  ): Promise<{ message: string; clockedInAt: Date; shiftName: string }> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    // Check if already clocked in
    if (profile.isClockedIn) {
      throw new BadRequestException('Already clocked in. Please clock out first.');
    }

    // Find the shift
    const shift = await this.shiftRepository.findOne({
      where: { id: dto.shiftId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Verify shift is active (published or in-progress)
    if (shift.status !== ShiftStatus.PUBLISHED && shift.status !== ShiftStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot clock in to a shift with status "${shift.status}". ` +
        'Only published or in-progress shifts are available for clock-in.',
      );
    }

    // Verify staff is assigned to this shift
    const assignment = await this.shiftStaffRepository.findOne({
      where: {
        shiftId: dto.shiftId,
        staffProfileId: profile.id,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You are not assigned to this shift. Contact your manager.',
      );
    }

    // Verify staff is not already clocked in for this shift
    if (assignment.status === ShiftStaffStatus.CLOCKED_IN) {
      throw new BadRequestException('Already clocked in for this shift.');
    }

    // Update assignment record
    const now = new Date();
    assignment.clockedInAt = now;
    assignment.status = ShiftStaffStatus.CLOCKED_IN;
    await this.shiftStaffRepository.save(assignment);

    // Update staff profile
    profile.isClockedIn = true;
    profile.currentShiftId = dto.shiftId;
    await this.staffProfileRepository.save(profile);

    // If shift is still published, auto-transition to in-progress
    if (shift.status === ShiftStatus.PUBLISHED) {
      shift.status = ShiftStatus.IN_PROGRESS;
      await this.shiftRepository.save(shift);
    }

    this.logger.log(`Staff ${userId} clocked in to shift ${dto.shiftId}`);

    return {
      message: 'Clocked in successfully',
      clockedInAt: now,
      shiftName: shift.name,
    };
  }

  /**
   * POST /staff/clock-out
   * Clock out from the current active shift.
   *
   * Calculates hours worked and returns an earnings summary.
   */
  async clockOut(
    userId: string,
    userRole: Role,
    merchantId?: string,
  ): Promise<ClockOutSummaryDto> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    // Check if clocked in
    if (!profile.isClockedIn || !profile.currentShiftId) {
      throw new BadRequestException('Not currently clocked in.');
    }

    // Find the active assignment
    const assignment = await this.shiftStaffRepository.findOne({
      where: {
        shiftId: profile.currentShiftId,
        staffProfileId: profile.id,
      },
      relations: ['shift'],
    });

    if (!assignment) {
      // Inconsistent state — clear profile fields
      profile.isClockedIn = false;
      profile.currentShiftId = null;
      await this.staffProfileRepository.save(profile);
      throw new BadRequestException('No active shift assignment found. Profile reset.');
    }

    if (!assignment.clockedInAt) {
      throw new BadRequestException('Clock-in time not recorded. Contact support.');
    }

    // Clock out
    const now = new Date();
    assignment.clockedOutAt = now;
    assignment.status = ShiftStaffStatus.CLOCKED_OUT;
    await this.shiftStaffRepository.save(assignment);

    // Update staff profile
    profile.isClockedIn = false;
    profile.currentShiftId = null;
    await this.staffProfileRepository.save(profile);

    // Calculate hours worked
    const hoursWorked =
      (now.getTime() - assignment.clockedInAt.getTime()) / (1000 * 60 * 60);

    this.logger.log(`Staff ${userId} clocked out of shift ${profile.currentShiftId}`);

    return {
      shiftId: assignment.shift.id,
      shiftName: assignment.shift.name,
      clockedInAt: assignment.clockedInAt,
      clockedOutAt: now,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      tipsEarned: assignment.tipsEarned,
    };
  }

  /**
   * GET /staff/shifts
   * Return personal shift schedule with optional filters.
   */
  async getPersonalShifts(
    userId: string,
    userRole: Role,
    merchantId?: string,
    status?: number,
    from?: string,
    to?: string,
  ): Promise<PersonalShiftDto[]> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    // Build query for assigned shifts
    const queryBuilder = this.shiftStaffRepository
      .createQueryBuilder('ss')
      .leftJoinAndSelect('ss.shift', 'shift')
      .where('ss.staffProfileId = :staffProfileId', {
        staffProfileId: profile.id,
      });

    // Filter by shift status
    if (status) {
      queryBuilder.andWhere('shift.status = :status', { status });
    }

    // Filter by date range
    if (from) {
      queryBuilder.andWhere('shift.startsAt >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('shift.endsAt <= :to', { to });
    }

    queryBuilder.orderBy('shift.startsAt', 'DESC');

    const assignments = await queryBuilder.getMany();

    return assignments.map((a) => ({
      id: a.shift.id,
      name: a.shift.name,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
      status: a.shift.status,
      clockedInAt: a.clockedInAt,
      clockedOutAt: a.clockedOutAt,
    }));
  }

  /**
   * GET /staff/schedule
   * Return a calendar-style view of assigned shifts for a given week.
   */
  async getSchedule(
    userId: string,
    userRole: Role,
    merchantId?: string,
    weekStart?: string,
  ): Promise<PersonalShiftDto[]> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    // Default to current week (Monday)
    const monday = weekStart ? new Date(weekStart) : this.getCurrentWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const assignments = await this.shiftStaffRepository.find({
      where: {
        staffProfileId: profile.id,
      },
      relations: ['shift'],
    });

    // Filter to shifts within the week
    const weekShifts = assignments.filter((a) => {
      const s = a.shift.startsAt.getTime();
      return s >= monday.getTime() && s <= sunday.getTime();
    });

    weekShifts.sort((a, b) => a.shift.startsAt.getTime() - b.shift.startsAt.getTime());

    return weekShifts.map((a) => ({
      id: a.shift.id,
      name: a.shift.name,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
      status: a.shift.status,
      clockedInAt: a.clockedInAt,
      clockedOutAt: a.clockedOutAt,
    }));
  }

  /**
   * Get the Monday of the current week at 00:00:00
   */
  private getCurrentWeekMonday(): Date {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const diff = day === 0 ? 6 : day - 1; // Days since Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
}
