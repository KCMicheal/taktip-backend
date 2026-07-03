import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MerchantShiftsService } from '../../src/shifts/merchant-shifts.service';
import { Shift } from '../../src/shifts/entities/shift.entity';
import { ShiftStaff } from '../../src/shifts/entities/shift-staff.entity';
import { Merchant } from '../../src/merchant/entities/merchant.entity';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { PaginationService } from '../../src/common/pagination/pagination.service';
import { CreateShiftDto } from '../../src/shifts/dto/create-shift.dto';
import { UpdateShiftDto } from '../../src/shifts/dto/update-shift.dto';
import { ShiftStatus } from '../../src/shifts/enums/shift-status.enum';
import { ShiftStaffStatus } from '../../src/shifts/enums/shift-staff-status.enum';
import { NotificationService } from '../../src/notification/notification.service';

describe('MerchantShiftsService', () => {
  let service: MerchantShiftsService;
  let merchantRepository: Repository<Merchant>;
  let shiftRepository: Repository<Shift>;
  let shiftStaffRepository: Repository<ShiftStaff>;
  let staffProfileRepository: Repository<StaffProfile>;
  let paginationService: PaginationService;

  const mockMerchantRepository = {
    findOne: jest.fn(),
  };

  const mockShiftRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockShiftStaffRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockPaginationService = {
    getSkip: jest.fn(),
    wrap: jest.fn(),
  };

  const createMockMerchant = (overrides: Partial<Merchant> = {}) => {
    const merchant = new Merchant();
    Object.assign(merchant, {
      id: 'merchant-uuid',
      ownerId: 'owner-uuid',
      name: 'Test Restaurant',
      shortCode: 'CODE123456-TR',
      ...overrides,
    });
    return merchant;
  };

  const createMockShift = (overrides: Partial<Shift> = {}) => {
    const shift = new Shift();
    Object.assign(shift, {
      id: 'shift-uuid',
      merchantId: 'merchant-uuid',
      name: 'Morning Shift',
      startsAt: new Date('2026-06-04T08:00:00Z'),
      endsAt: new Date('2026-06-04T16:00:00Z'),
      status: ShiftStatus.DRAFT,
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
      ...overrides,
    });
    return assignment;
  };

  // Mock query builder for getShifts
  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantShiftsService,
        {
          provide: getRepositoryToken(Merchant),
          useValue: mockMerchantRepository,
        },
        {
          provide: getRepositoryToken(Shift),
          useValue: mockShiftRepository,
        },
        {
          provide: getRepositoryToken(ShiftStaff),
          useValue: mockShiftStaffRepository,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: PaginationService,
          useValue: mockPaginationService,
        },
        {
          provide: NotificationService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'notif-uuid' }),
            createBulk: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<MerchantShiftsService>(MerchantShiftsService);
    merchantRepository = module.get<Repository<Merchant>>(
      getRepositoryToken(Merchant),
    );
    shiftRepository = module.get<Repository<Shift>>(
      getRepositoryToken(Shift),
    );
    shiftStaffRepository = module.get<Repository<ShiftStaff>>(
      getRepositoryToken(ShiftStaff),
    );
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
    );
    paginationService = module.get<PaginationService>(PaginationService);

    // Reset mock implementations
    mockQueryBuilder.getManyAndCount.mockReset();
    mockShiftRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getShifts
  // ---------------------------------------------------------------------------
  describe('getShifts', () => {
    it('should return paginated shifts for the merchant', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[shift], 1]);
      mockPaginationService.getSkip.mockReturnValue(0);
      mockPaginationService.wrap.mockReturnValue({
        items: [shift],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.getShifts('merchant-uuid', 'owner-uuid');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockMerchantRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'merchant-uuid' },
      });
    });

    it('should filter by status', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      mockPaginationService.getSkip.mockReturnValue(0);
      mockPaginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getShifts('merchant-uuid', 'owner-uuid', ShiftStatus.DRAFT);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.status = :status',
        { status: ShiftStatus.DRAFT },
      );
    });

    it('should filter by date range', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      mockPaginationService.getSkip.mockReturnValue(0);
      mockPaginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getShifts('merchant-uuid', 'owner-uuid', undefined, '2026-06-01', '2026-06-07');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.startsAt >= :from',
        { from: '2026-06-01' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'shift.endsAt <= :to',
        { to: '2026-06-07' },
      );
    });

    it('should throw NotFoundException if merchant does not exist', async () => {
      mockMerchantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getShifts('unknown-merchant', 'owner-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      const merchant = createMockMerchant({ ownerId: 'other-owner' });
      mockMerchantRepository.findOne.mockResolvedValue(merchant);

      await expect(
        service.getShifts('merchant-uuid', 'wrong-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // getShift (detail)
  // ---------------------------------------------------------------------------
  describe('getShift', () => {
    it('should return shift detail with assigned staff', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const staffProfile = {
        id: 'profile-uuid',
        displayName: 'John Doe',
        user: { firstName: 'John', lastName: 'Doe' },
      } as any;
      const assignment = createMockAssignment({
        staffProfile: staffProfile,
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getShift('shift-uuid', 'merchant-uuid', 'owner-uuid');

      expect(result.id).toBe('shift-uuid');
      expect(result.name).toBe('Morning Shift');
      expect(result.assignedStaff).toHaveLength(1);
      expect(result.assignedStaff[0].staffName).toBe('John Doe');
      expect(result.assignedStaff[0].staffProfileId).toBe('profile-uuid');
    });

    it('should derive staff name from user firstName + lastName when displayName is null', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const staffProfile = {
        id: 'profile-uuid',
        displayName: null,
        user: { firstName: 'Jane', lastName: 'Smith' },
      } as any;
      const assignment = createMockAssignment({ staffProfile });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getShift('shift-uuid', 'merchant-uuid', 'owner-uuid');

      expect(result.assignedStaff[0].staffName).toBe('Jane Smith');
    });

    it('should return null staffName when no user info available', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const staffProfile = {
        id: 'profile-uuid',
        displayName: null,
        user: null,
      } as any;
      const assignment = createMockAssignment({ staffProfile });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.find.mockResolvedValue([assignment]);

      const result = await service.getShift('shift-uuid', 'merchant-uuid', 'owner-uuid');

      expect(result.assignedStaff[0].staffName).toBeNull();
    });

    it('should throw NotFoundException if shift does not exist', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getShift('unknown-shift', 'merchant-uuid', 'owner-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // createShift
  // ---------------------------------------------------------------------------
  describe('createShift', () => {
    const validDto: CreateShiftDto = {
      name: 'Evening Shift',
      startsAt: '2026-06-04T17:00:00Z',
      endsAt: '2026-06-04T23:00:00Z',
    };

    it('should create a shift without staff assignments', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({
        name: 'Evening Shift',
        status: ShiftStatus.DRAFT,
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.create.mockReturnValue(shift);
      mockShiftRepository.save.mockResolvedValue(shift);

      const result = await service.createShift('merchant-uuid', 'owner-uuid', validDto);

      expect(result.name).toBe('Evening Shift');
      expect(result.status).toBe(ShiftStatus.DRAFT);
      expect(mockShiftRepository.create).toHaveBeenCalledWith({
        merchantId: 'merchant-uuid',
        name: 'Evening Shift',
        startsAt: new Date('2026-06-04T17:00:00Z'),
        endsAt: new Date('2026-06-04T23:00:00Z'),
        status: ShiftStatus.DRAFT,
        distributionPolicy: null,
      });
    });

    it('should create a shift with staff assignments', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ name: 'Evening Shift' });
      const dtoWithStaff: CreateShiftDto = {
        ...validDto,
        staffProfileIds: ['profile-1', 'profile-2'],
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockStaffProfileRepository.find.mockResolvedValue([
        { id: 'profile-1' },
        { id: 'profile-2' },
      ]);
      mockShiftRepository.create.mockReturnValue(shift);
      mockShiftRepository.save.mockResolvedValue(shift);
      mockShiftStaffRepository.create
        .mockReturnValueOnce(createMockAssignment({ staffProfileId: 'profile-1' }))
        .mockReturnValueOnce(createMockAssignment({ staffProfileId: 'profile-2' }));

      const result = await service.createShift('merchant-uuid', 'owner-uuid', dtoWithStaff);

      expect(result.name).toBe('Evening Shift');
      expect(mockShiftStaffRepository.create).toHaveBeenCalledTimes(2);
      expect(mockShiftStaffRepository.save).toHaveBeenCalled();
    });

    it('should create a shift with distribution policy', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({
        name: 'Evening Shift',
        distributionPolicy: { type: 'pool', split: 'equal' },
      });
      const dtoWithPolicy: CreateShiftDto = {
        ...validDto,
        distributionPolicy: { type: 'pool', split: 'equal' },
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.create.mockReturnValue(shift);
      mockShiftRepository.save.mockResolvedValue(shift);

      await service.createShift('merchant-uuid', 'owner-uuid', dtoWithPolicy);

      expect(mockShiftRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          distributionPolicy: { type: 'pool', split: 'equal' },
        }),
      );
    });

    it('should throw BadRequestException if endsAt is before startsAt', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);

      const badDto: CreateShiftDto = {
        name: 'Invalid Shift',
        startsAt: '2026-06-04T16:00:00Z',
        endsAt: '2026-06-04T08:00:00Z',
      };

      await expect(
        service.createShift('merchant-uuid', 'owner-uuid', badDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if endsAt equals startsAt', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);

      const badDto: CreateShiftDto = {
        name: 'Invalid Shift',
        startsAt: '2026-06-04T08:00:00Z',
        endsAt: '2026-06-04T08:00:00Z',
      };

      await expect(
        service.createShift('merchant-uuid', 'owner-uuid', badDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // updateShift
  // ---------------------------------------------------------------------------
  describe('updateShift', () => {
    it('should update shift fields', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.DRAFT });
      const updateDto: UpdateShiftDto = {
        name: 'Updated Shift',
        status: ShiftStatus.PUBLISHED,
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftRepository.save.mockResolvedValue({
        ...shift,
        name: 'Updated Shift',
        status: ShiftStatus.PUBLISHED,
      });
      // getShift returns shift with assignments
      mockShiftStaffRepository.find.mockResolvedValue([]);

      await service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', updateDto);

      expect(mockShiftRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Shift',
          status: ShiftStatus.PUBLISHED,
        }),
      );
    });

    it('should add staff assignments', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const updateDto: UpdateShiftDto = {
        addStaffProfileIds: ['new-staff-profile'],
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockStaffProfileRepository.find.mockResolvedValue([{ id: 'new-staff-profile' }]);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.create.mockReturnValue(
        createMockAssignment({ staffProfileId: 'new-staff-profile' }),
      );
      mockShiftStaffRepository.find.mockResolvedValue([]);

      await service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', updateDto);

      expect(mockShiftStaffRepository.create).toHaveBeenCalledWith({
        shiftId: 'shift-uuid',
        staffProfileId: 'new-staff-profile',
        status: ShiftStaffStatus.ASSIGNED,
      });
      expect(mockShiftStaffRepository.save).toHaveBeenCalled();
    });

    it('should remove staff assignments', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const updateDto: UpdateShiftDto = {
        removeStaffProfileIds: ['profile-to-remove'],
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.find.mockResolvedValue([]);

      await service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', updateDto);

      expect(mockShiftStaffRepository.delete).toHaveBeenCalledWith({
        shiftId: 'shift-uuid',
        staffProfileId: In(['profile-to-remove']),
      });
    });

    it('should throw NotFoundException if shift does not exist', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateShift('unknown', 'merchant-uuid', 'owner-uuid', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if shift is COMPLETED', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.COMPLETED });
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', { name: 'Try' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if shift is CANCELLED', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.CANCELLED });
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', { name: 'Try' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if update causes end <= start', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      const badDto: UpdateShiftDto = {
        endsAt: '2026-06-03T07:00:00Z', // Before startsAt (08:00)
      };

      await expect(
        service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', badDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update distributionPolicy', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift();
      const updateDto: UpdateShiftDto = {
        distributionPolicy: { type: 'percentage', shares: { waiter: 60, chef: 40 } },
      };

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftRepository.save.mockResolvedValue(shift);
      mockShiftStaffRepository.find.mockResolvedValue([]);

      await service.updateShift('shift-uuid', 'merchant-uuid', 'owner-uuid', updateDto);

      expect(mockShiftRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          distributionPolicy: { type: 'percentage', shares: { waiter: 60, chef: 40 } },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteShift
  // ---------------------------------------------------------------------------
  describe('deleteShift', () => {
    it('should delete a draft shift successfully', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.DRAFT });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.count.mockResolvedValue(0);
      mockShiftStaffRepository.delete.mockResolvedValue({ affected: 0 });
      mockShiftRepository.remove.mockResolvedValue(shift);

      const result = await service.deleteShift('shift-uuid', 'merchant-uuid', 'owner-uuid');

      expect(result.message).toBe('Shift deleted successfully');
      expect(mockShiftStaffRepository.delete).toHaveBeenCalledWith({ shiftId: 'shift-uuid' });
      expect(mockShiftRepository.remove).toHaveBeenCalledWith(shift);
    });

    it('should throw BadRequestException for completed shift', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.COMPLETED });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.deleteShift('shift-uuid', 'merchant-uuid', 'owner-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for cancelled shift', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.CANCELLED });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);

      await expect(
        service.deleteShift('shift-uuid', 'merchant-uuid', 'owner-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if staff are clocked in', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.DRAFT });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.count.mockResolvedValue(2); // 2 staff clocked in

      await expect(
        service.deleteShift('shift-uuid', 'merchant-uuid', 'owner-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if shift does not exist', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteShift('unknown', 'merchant-uuid', 'owner-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete published shift with no clocked-in staff', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({ status: ShiftStatus.PUBLISHED });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.findOne.mockResolvedValue(shift);
      mockShiftStaffRepository.count.mockResolvedValue(0);
      mockShiftStaffRepository.delete.mockResolvedValue({ affected: 0 });
      mockShiftRepository.remove.mockResolvedValue(shift);

      const result = await service.deleteShift('shift-uuid', 'merchant-uuid', 'owner-uuid');

      expect(result.message).toBe('Shift deleted successfully');
    });
  });

  // ---------------------------------------------------------------------------
  // getRoster
  // ---------------------------------------------------------------------------
  describe('getRoster', () => {
    const mockMonday = new Date('2026-06-01T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers({ now: mockMonday });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return weekly roster grouped by day', async () => {
      const merchant = createMockMerchant();
      const shift = createMockShift({
        startsAt: new Date('2026-06-03T12:00:00Z'), // Wednesday
        endsAt: new Date('2026-06-03T20:00:00Z'),
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([shift]);
      mockShiftStaffRepository.count
        .mockResolvedValueOnce(3)  // total assigned
        .mockResolvedValueOnce(1); // clocked in

      const result = await service.getRoster('merchant-uuid', 'owner-uuid');

      expect(result).toHaveLength(7); // 7 days
      // Find the day that has the shift (avoids timezone-dependent index)
      const dayWithShift = result.find((d) => d.shifts.length > 0);
      expect(dayWithShift).toBeDefined();
      expect(dayWithShift!.shifts).toHaveLength(1);
      expect(dayWithShift!.shifts[0].name).toBe('Morning Shift');
      expect(dayWithShift!.shifts[0].staffCount).toBe(3);
      expect(dayWithShift!.shifts[0].clockedInCount).toBe(1);
    });

    it('should return empty shifts array for days with no shifts', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([]);

      const result = await service.getRoster('merchant-uuid', 'owner-uuid');

      expect(result).toHaveLength(7);
      result.forEach((day) => {
        expect(day.shifts).toHaveLength(0);
      });
    });

    it('should use provided weekStart', async () => {
      const merchant = createMockMerchant();
      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([]);

      const result = await service.getRoster('merchant-uuid', 'owner-uuid', '2026-06-15');

      expect(result).toHaveLength(7);
      expect(result[0].date).toBe('2026-06-15');
      expect(result[6].date).toBe('2026-06-21');
    });
  });

  // ---------------------------------------------------------------------------
  // publishRoster
  // ---------------------------------------------------------------------------
  describe('publishRoster', () => {
    const mockMonday = new Date('2026-06-01T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers({ now: mockMonday });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should publish all draft shifts in the current week', async () => {
      const merchant = createMockMerchant();
      const draftShift = createMockShift({
        id: 'shift-1',
        name: 'Morning Shift',
        status: ShiftStatus.DRAFT,
        startsAt: new Date('2026-06-03T12:00:00Z'),
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([draftShift]);
      mockShiftRepository.save.mockResolvedValue({ ...draftShift, status: ShiftStatus.PUBLISHED });

      const result = await service.publishRoster('merchant-uuid', 'owner-uuid');

      expect(result.publishedCount).toBe(1);
      expect(result.message).toContain('Published');
      expect(mockShiftRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ShiftStatus.PUBLISHED }),
      );
    });

    it('should return 0 if no draft shifts in the week', async () => {
      const merchant = createMockMerchant();
      // Shift outside current week
      const shiftOutsideWeek = createMockShift({
        startsAt: new Date('2026-07-01T08:00:00Z'),
        status: ShiftStatus.DRAFT,
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([shiftOutsideWeek]);

      const result = await service.publishRoster('merchant-uuid', 'owner-uuid');

      expect(result.publishedCount).toBe(0);
      expect(result.message).toBe('No draft shifts to publish for this week');
    });

    it('should only publish DRAFT shifts (skip PUBLISHED)', async () => {
      const merchant = createMockMerchant();
      const draftShift = createMockShift({
        id: 'draft-shift',
        name: 'Draft Shift',
        status: ShiftStatus.DRAFT,
        startsAt: new Date('2026-06-03T12:00:00Z'),
      });
      const publishedShift = createMockShift({
        id: 'published-shift',
        name: 'Published Shift',
        status: ShiftStatus.PUBLISHED,
        startsAt: new Date('2026-07-01T12:00:00Z'), // Outside current week
      });

      mockMerchantRepository.findOne.mockResolvedValue(merchant);
      mockShiftRepository.find.mockResolvedValue([draftShift, publishedShift]);
      mockShiftRepository.save.mockResolvedValue({ ...draftShift, status: ShiftStatus.PUBLISHED });

      const result = await service.publishRoster('merchant-uuid', 'owner-uuid');

      expect(result.publishedCount).toBe(1);
    });
  });
});
