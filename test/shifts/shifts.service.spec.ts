import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ShiftsService } from '../../src/shifts/shifts.service';
import { Shift } from '../../src/shifts/entities/shift.entity';
import { ShiftStaff } from '../../src/shifts/entities/shift-staff.entity';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { Role } from '../../src/auth/enums/role.enum';
import { ClockInDto } from '../../src/shifts/dto/clock-in.dto';
import { ShiftStatus } from '../../src/shifts/enums/shift-status.enum';
import { ShiftStaffStatus } from '../../src/shifts/enums/shift-staff-status.enum';

describe('ShiftsService (staff)', () => {
  let service: ShiftsService;
  let staffProfileRepository: Repository<StaffProfile>;
  let shiftRepository: Repository<Shift>;
  let shiftStaffRepository: Repository<ShiftStaff>;

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockShiftRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockShiftStaffRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUser = {
    id: 'user-uuid',
    email: 'staff@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+2348000000000',
  };

  const mockMerchant = {
    id: 'merchant-uuid',
    name: 'Test Restaurant',
    shortCode: 'CODE123456-TR',
  };

  const createMockProfile = (overrides: Partial<StaffProfile> = {}) => {
    const profile = new StaffProfile();
    Object.assign(profile, {
      id: 'profile-uuid',
      userId: 'user-uuid',
      merchantId: 'merchant-uuid',
      displayName: 'John Doe',
      roleTag: 'waiter',
      isClockedIn: false,
      currentShiftId: null,
      payoutMethod: null,
      settings: null,
      user: mockUser,
      merchant: mockMerchant,
      ...overrides,
    });
    return profile;
  };

  const createMockShift = (overrides: Partial<Shift> = {}) => {
    const shift = new Shift();
    Object.assign(shift, {
      id: 'shift-uuid',
      merchantId: 'merchant-uuid',
      name: 'Morning Shift',
      startsAt: new Date('2026-06-04T08:00:00Z'),
      endsAt: new Date('2026-06-04T16:00:00Z'),
      status: ShiftStatus.PUBLISHED,
      distributionPolicy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return shift;
  };

  const createMockAssignment = (overrides: Partial<ShiftStaff> = {}) => {
    const assignment = new ShiftStaff();
    Object.assign(assignment, {
      shiftId: 'shift-uuid',
      staffProfileId: 'profile-uuid',
      status: ShiftStaffStatus.ASSIGNED,
      clockedInAt: null,
      clockedOutAt: null,
      tipsEarned: null,
      shift: createMockShift(),
      ...overrides,
    });
    return assignment;
  };

  // Mock query builder
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: getRepositoryToken(Shift),
          useValue: mockShiftRepository,
        },
        {
          provide: getRepositoryToken(ShiftStaff),
          useValue: mockShiftStaffRepository,
        },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
    );
    shiftRepository = module.get<Repository<Shift>>(
      getRepositoryToken(Shift),
    );
    shiftStaffRepository = module.get<Repository<ShiftStaff>>(
      getRepositoryToken(ShiftStaff),
    );

    // Reset mock implementations
    mockQueryBuilder.getMany.mockReset();
    mockShiftStaffRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // clockIn
  // ---------------------------------------------------------------------------
  describe('clockIn', () => {
    const validDto: ClockInDto = { shiftId: 'shift-uuid' };

    it('should clock in successfully and auto-transition shift to IN_PROGRESS', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({ status: ShiftStatus.PUBLISHED });
      const assignment = createMockAssignment({ status: ShiftStaffStatus.ASSIGNED });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.findOne.mockResolvedValue(assignment);
      mockShiftStaffRepository.save.mockResolvedValue({ ...assignment, clockedInAt: new Date(), status: ShiftStaffStatus.CLOCKED_IN });
      mockStaffProfileRepository.save.mockResolvedValue({ ...profile, isClockedIn: true, currentShiftId: 'shift-uuid' });
      mockShiftRepository.save.mockResolvedValue({ ...shift, status: ShiftStatus.IN_PROGRESS });

      const result = await service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid');

      expect(result.message).toBe('Clocked in successfully');
      expect(result.shiftName).toBe('Morning Shift');
      expect(result.clockedInAt).toBeDefined();
      expect(mockShiftRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ShiftStatus.IN_PROGRESS }),
      );
    });

    it('should clock in to an in-progress shift without auto-transition', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({ status: ShiftStatus.IN_PROGRESS });
      const assignment = createMockAssignment({ status: ShiftStaffStatus.ASSIGNED });

      // No merchantId → getProfile uses find() for single-profile fallback
      mockStaffProfileRepository.find.mockResolvedValue([profile]);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.findOne.mockResolvedValue(assignment);
      mockShiftStaffRepository.save.mockResolvedValue({ ...assignment, clockedInAt: new Date(), status: ShiftStaffStatus.CLOCKED_IN });
      mockStaffProfileRepository.save.mockResolvedValue({ ...profile, isClockedIn: true, currentShiftId: 'shift-uuid' });

      const result = await service.clockIn('user-uuid', Role.STAFF, validDto);

      expect(result.message).toBe('Clocked in successfully');
      // Shift was already IN_PROGRESS — should NOT save shift again
      expect(mockShiftRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not STAFF', async () => {
      await expect(
        service.clockIn('user-uuid', Role.MERCHANT, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is CUSTOMER', async () => {
      await expect(
        service.clockIn('user-uuid', Role.CUSTOMER, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already clocked in (profile level)', async () => {
      const profile = createMockProfile({ isClockedIn: true, currentShiftId: 'other-shift' });
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if shift does not exist', async () => {
      const profile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(null);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if shift status is DRAFT', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({ status: ShiftStatus.DRAFT });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if shift is COMPLETED', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({ status: ShiftStatus.COMPLETED });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if shift is CANCELLED', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({ status: ShiftStatus.CANCELLED });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if staff is not assigned to the shift', async () => {
      const profile = createMockProfile();
      const shift = createMockShift();

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.findOne.mockResolvedValue(null);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already clocked in for this shift (assignment level)', async () => {
      const profile = createMockProfile();
      const shift = createMockShift();
      const assignment = createMockAssignment({ status: ShiftStaffStatus.CLOCKED_IN });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.findOne.mockResolvedValue(assignment);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if staff profile missing', async () => {
      mockStaffProfileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto, 'merchant-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if multiple profiles and no merchantId', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([
        createMockProfile({ id: 'profile-1', merchantId: 'merchant-a' }),
        createMockProfile({ id: 'profile-2', merchantId: 'merchant-b' }),
      ]);

      await expect(
        service.clockIn('user-uuid', Role.STAFF, validDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // clockOut
  // ---------------------------------------------------------------------------
  describe('clockOut', () => {
    it('should clock out successfully and return summary', async () => {
      // Pin "now" to a fixed time so hoursWorked calculation is deterministic
      jest.useFakeTimers({ now: new Date('2026-06-04T10:00:00.000Z') });

      const clockedInAt = new Date('2026-06-04T08:00:00Z');
      const profile = createMockProfile({
        isClockedIn: true,
        currentShiftId: 'shift-uuid',
      });
      const shift = createMockShift();
      const assignment = createMockAssignment({
        status: ShiftStaffStatus.CLOCKED_IN,
        clockedInAt,
        shift,
      });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.findOne.mockResolvedValue(assignment);
      mockShiftStaffRepository.save.mockResolvedValue({
        ...assignment,
        clockedOutAt: new Date(),
        status: ShiftStaffStatus.CLOCKED_OUT,
      });
      mockStaffProfileRepository.save.mockResolvedValue({
        ...profile,
        isClockedIn: false,
        currentShiftId: null,
      });

      const result = await service.clockOut('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result.shiftId).toBe('shift-uuid');
      expect(result.shiftName).toBe('Morning Shift');
      expect(result.clockedInAt).toEqual(clockedInAt);
      expect(result.clockedOutAt).toBeDefined();
      // 2 hours between 08:00 and 10:00
      expect(result.hoursWorked).toBeCloseTo(2, 1);
      expect(typeof result.hoursWorked).toBe('number');

      jest.useRealTimers();
    });

    it('should throw ForbiddenException if user is not STAFF', async () => {
      await expect(
        service.clockOut('user-uuid', Role.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if not clocked in', async () => {
      const profile = createMockProfile({ isClockedIn: false, currentShiftId: null });
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);

      await expect(
        service.clockOut('user-uuid', Role.STAFF, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if isClockedIn is true but currentShiftId is null', async () => {
      const profile = createMockProfile({ isClockedIn: true, currentShiftId: null });
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);

      await expect(
        service.clockOut('user-uuid', Role.STAFF, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reset profile and throw if no active assignment found (inconsistent state)', async () => {
      const profile = createMockProfile({
        isClockedIn: true,
        currentShiftId: 'shift-uuid',
      });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.findOne.mockResolvedValue(null);

      await expect(
        service.clockOut('user-uuid', Role.STAFF, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);

      // Should reset profile
      expect(mockStaffProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isClockedIn: false,
          currentShiftId: null,
        }),
      );
    });

    it('should throw BadRequestException if clockedInAt was not recorded', async () => {
      const profile = createMockProfile({
        isClockedIn: true,
        currentShiftId: 'shift-uuid',
      });
      const shift = createMockShift();
      const assignment = createMockAssignment({
        status: ShiftStaffStatus.CLOCKED_IN,
        clockedInAt: null,
        shift,
      });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.findOne.mockResolvedValue(assignment);

      await expect(
        service.clockOut('user-uuid', Role.STAFF, 'merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // getPersonalShifts
  // ---------------------------------------------------------------------------
  describe('getPersonalShifts', () => {
    it('should return all assigned shifts for the staff member', async () => {
      const profile = createMockProfile();
      const shift = createMockShift();
      const assignment = createMockAssignment({
        clockedInAt: new Date('2026-06-04T08:00:00Z'),
        clockedOutAt: new Date('2026-06-04T16:00:00Z'),
        shift,
      });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockQueryBuilder.getMany.mockResolvedValue([assignment]);

      const result = await service.getPersonalShifts('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('shift-uuid');
      expect(result[0].name).toBe('Morning Shift');
      expect(result[0].status).toBe(ShiftStatus.PUBLISHED);
    });

    it('should filter by shift status', async () => {
      const profile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getPersonalShifts('user-uuid', Role.STAFF, 'merchant-uuid', ShiftStatus.IN_PROGRESS);

      expect(result).toHaveLength(0);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.status = :status',
        { status: ShiftStatus.IN_PROGRESS },
      );
    });

    it('should filter by date range', async () => {
      const profile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const from = '2026-06-01';
      const to = '2026-06-07';
      await service.getPersonalShifts('user-uuid', Role.STAFF, 'merchant-uuid', undefined, from, to);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.startsAt >= :from',
        { from },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.endsAt <= :to',
        { to },
      );
    });

    it('should return empty array when no assignments', async () => {
      const profile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getPersonalShifts('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toHaveLength(0);
    });

    it('should throw ForbiddenException if user is not STAFF', async () => {
      await expect(
        service.getPersonalShifts('user-uuid', Role.MERCHANT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use single-profile fallback when no merchantId', async () => {
      const profile = createMockProfile();
      const shift = createMockShift();
      const assignment = createMockAssignment({ shift });

      mockStaffProfileRepository.find.mockResolvedValue([profile]);
      mockQueryBuilder.getMany.mockResolvedValue([assignment]);

      const result = await service.getPersonalShifts('user-uuid', Role.STAFF);

      expect(result).toHaveLength(1);
      expect(mockStaffProfileRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
        relations: ['user', 'merchant'],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getSchedule
  // ---------------------------------------------------------------------------
  describe('getSchedule', () => {
    const mockMonday = new Date('2026-06-01T00:00:00.000Z'); // Monday
    const mockSunday = new Date('2026-06-07T23:59:59.999Z');

    beforeEach(() => {
      jest.useFakeTimers({ now: mockMonday });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return this week\'s schedule', async () => {
      const profile = createMockProfile();
      const shift = createMockShift({
        startsAt: new Date('2026-06-03T08:00:00Z'), // Wednesday within week
        endsAt: new Date('2026-06-03T16:00:00Z'),
      });
      const assignment = createMockAssignment({ shift });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getSchedule('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Morning Shift');
    });

    it('should return empty array when no shifts in the current week', async () => {
      const profile = createMockProfile();
      // Shift outside the week (next month)
      const shift = createMockShift({
        startsAt: new Date('2026-07-01T08:00:00Z'),
        endsAt: new Date('2026-07-01T16:00:00Z'),
      });
      const assignment = createMockAssignment({ shift });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getSchedule('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toHaveLength(0);
    });

    it('should use provided weekStart parameter', async () => {
      const profile = createMockProfile();
      const weekStart = '2026-06-15'; // Monday of that week
      const shift = createMockShift({
        startsAt: new Date('2026-06-17T08:00:00Z'), // Wednesday of that week
        endsAt: new Date('2026-06-17T16:00:00Z'),
      });
      const assignment = createMockAssignment({ shift });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getSchedule('user-uuid', Role.STAFF, 'merchant-uuid', weekStart);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Morning Shift');
    });

    it('should return shifts sorted by start time ascending', async () => {
      const profile = createMockProfile();

      const shift1 = createMockShift({
        id: 'shift-1',
        name: 'Late Shift',
        startsAt: new Date('2026-06-03T16:00:00Z'),
        endsAt: new Date('2026-06-04T00:00:00Z'),
      });
      const shift2 = createMockShift({
        id: 'shift-2',
        name: 'Morning Shift',
        startsAt: new Date('2026-06-03T08:00:00Z'),
        endsAt: new Date('2026-06-03T16:00:00Z'),
      });

      mockStaffProfileRepository.findOne.mockResolvedValue(profile);
      mockShiftStaffRepository.find.mockResolvedValue([
        createMockAssignment({ shift: shift1 }),
        createMockAssignment({ shift: shift2 }),
      ]);

      const result = await service.getSchedule('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Morning Shift'); // Earlier first
      expect(result[1].name).toBe('Late Shift');
    });

    it('should throw ForbiddenException if user is not STAFF', async () => {
      await expect(
        service.getSchedule('user-uuid', Role.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use single-profile fallback when no merchantId', async () => {
      const profile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([profile]);
      mockShiftStaffRepository.find.mockResolvedValue([]);

      const result = await service.getSchedule('user-uuid', Role.STAFF);

      expect(result).toHaveLength(0);
      expect(mockStaffProfileRepository.find).toHaveBeenCalled();
    });
  });
});
