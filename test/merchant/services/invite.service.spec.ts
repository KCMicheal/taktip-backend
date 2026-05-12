import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../../src/auth/services/mail.service';
import { InviteService } from '../../../src/merchant/services/invite.service';
import { StaffInvite } from '../../../src/merchant/entities/staff-invite.entity';
import { Merchant } from '../../../src/merchant/entities/merchant.entity';
import { User } from '../../../src/auth/entities/user.entity';
import { StaffProfile } from '../../../src/staff/entities/staff-profile.entity';
import { Role } from '../../../src/auth/enums/role.enum';
import { InviteStatus } from '../../../src/common/enums/invite-status.enum';
import { InviteStaffDto, AcceptInviteDto } from '../../../src/merchant/dto/invite.dto';

describe('InviteService', () => {
  let service: InviteService;
  let inviteRepository: Repository<StaffInvite>;
  let merchantRepository: Repository<Merchant>;
  let userRepository: Repository<User>;
  let mailService: MailService;

  const mockInviteRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockMerchantRepository = {
    findOne: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockMailService = {
    sendStaffInviteEmail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://app.taktip.com'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        {
          provide: getRepositoryToken(StaffInvite),
          useValue: mockInviteRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: mockMerchantRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<InviteService>(InviteService);
    inviteRepository = module.get<Repository<StaffInvite>>(getRepositoryToken(StaffInvite));
    merchantRepository = module.get<Repository<Merchant>>(getRepositoryToken(Merchant));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    mailService = module.get<MailService>(MailService);

    jest.clearAllMocks();
  });

  describe('inviteStaff', () => {
    it('should send invite and create invite record', async () => {
      const merchantId = 'merchant-uuid';
      const invitedById = 'owner-uuid';
      const dto: InviteStaffDto = {
        email: 'staff@example.com',
        role: 'STAFF',
      };

      const mockMerchant = { id: merchantId, name: 'Test Business', ownerId: invitedById };
      mockMerchantRepository.findOne.mockResolvedValue(mockMerchant);
      mockUserRepository.findOne.mockResolvedValue(null);
      mockInviteRepository.findOne.mockResolvedValue(null);

      const mockInvite = {
        id: 'invite-uuid',
        token: 'some-token',
        email: dto.email,
        merchantId,
        status: InviteStatus.PENDING,
      };
      mockInviteRepository.create.mockReturnValue(mockInvite);
      mockInviteRepository.save.mockResolvedValue(mockInvite);
      mockMailService.sendStaffInviteEmail.mockResolvedValue(undefined);

      const result = await service.inviteStaff(merchantId, dto, invitedById);

      expect(result).toEqual(mockInvite);
      expect(mockMailService.sendStaffInviteEmail).toHaveBeenCalledWith(
        dto.email,
        'Test Business',
        expect.stringContaining('https://app.taktip.com/register/staff?token='),
      );
    });

    it('should throw NotFoundException if merchant not found', async () => {
      mockMerchantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.inviteStaff('invalid-uuid', { email: 'test@example.com' }, 'owner-uuid'),
      ).rejects.toThrow('Merchant not found');
    });

    it('should throw BadRequestException if invite already pending', async () => {
      const merchantId = 'merchant-uuid';
      const mockMerchant = { id: merchantId, name: 'Test Business', ownerId: 'owner-uuid' };
      mockMerchantRepository.findOne.mockResolvedValue(mockMerchant);
      mockUserRepository.findOne.mockResolvedValue(null);

      const existingInvite = {
        id: 'existing-invite',
        status: InviteStatus.PENDING,
      };
      mockInviteRepository.findOne.mockResolvedValue(existingInvite);

      await expect(
        service.inviteStaff(merchantId, { email: 'staff@example.com' }, 'owner-uuid'),
      ).rejects.toThrow('An invite is already pending for this email');
    });
  });

  describe('validateToken', () => {
    it('should return invite if token is valid', async () => {
      const mockInvite = {
        token: 'valid-token',
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        merchant: { id: 'merchant-id' },
        invitedBy: { id: 'inviter-id' },
      };
      mockInviteRepository.findOne.mockResolvedValue(mockInvite);

      const result = await service.validateToken('valid-token');
      expect(result).toEqual(mockInvite);
    });

    it('should throw NotFoundException if token not found', async () => {
      mockInviteRepository.findOne.mockResolvedValue(null);

      await expect(service.validateToken('invalid-token')).rejects.toThrow('Invalid invite token');
    });

    it('should throw BadRequestException if token already accepted', async () => {
      const mockInvite = {
        token: 'accepted-token',
        status: InviteStatus.ACCEPTED,
      };
      mockInviteRepository.findOne.mockResolvedValue(mockInvite);

      await expect(service.validateToken('accepted-token')).rejects.toThrow('This invite has already been used');
    });

    it('should throw BadRequestException if token expired', async () => {
      const mockInvite = {
        token: 'expired-token',
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      };
      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.EXPIRED });

      await expect(service.validateToken('expired-token')).rejects.toThrow('This invite has expired');
      expect(mockInviteRepository.save).toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('should create new user and accept invite', async () => {
      const token = 'valid-token';
      const mockInvite = {
        token,
        email: 'staff@example.com',
        name: 'John Doe',
        status: InviteStatus.PENDING,
        merchantId: 'merchant-uuid',
        merchant: { id: 'merchant-uuid', name: 'Test Business' },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockUserRepository.findOne.mockResolvedValue(null);

      const newUser = {
        id: 'new-user-uuid',
        email: 'staff@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: Role.STAFF,
      };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.ACCEPTED });
      mockMerchantRepository.findOne.mockResolvedValue({ id: 'merchant-uuid' });

      // StaffProfile: no existing profile for this merchant, create new one
      mockStaffProfileRepository.findOne.mockResolvedValue(null);
      mockStaffProfileRepository.create.mockReturnValue({
        userId: 'new-user-uuid',
        merchantId: 'merchant-uuid',
      });
      mockStaffProfileRepository.save.mockResolvedValue({});

      const dto: AcceptInviteDto = {
        token,
        password: 'SecurePass123!',
      };

      const result = await service.acceptInvite(dto);

      expect(result.user).toEqual(newUser);
      expect(result.merchant).toBeDefined();
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'new-user-uuid', merchantId: 'merchant-uuid' },
      });
      expect(mockStaffProfileRepository.create).toHaveBeenCalled();
      expect(mockStaffProfileRepository.save).toHaveBeenCalled();
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'staff@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: Role.STAFF,
        }),
      );
    });

    it('should create new staff profile for new merchant (same user, different merchant)', async () => {
      const token = 'another-merchant-token';
      const existingUser = {
        id: 'existing-user-uuid',
        email: 'staff@example.com',
      };

      const mockInvite = {
        token,
        email: 'staff@example.com',
        status: InviteStatus.PENDING,
        merchantId: 'merchant-b-uuid',
        merchant: { id: 'merchant-b-uuid' },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.ACCEPTED });
      mockMerchantRepository.findOne.mockResolvedValue({ id: 'merchant-b-uuid' });

      // User already has a profile for Merchant A, but NOT for Merchant B → create new
      mockStaffProfileRepository.findOne.mockResolvedValue(null);
      mockStaffProfileRepository.create.mockReturnValue({
        userId: 'existing-user-uuid',
        merchantId: 'merchant-b-uuid',
      });
      mockStaffProfileRepository.save.mockResolvedValue({});

      const dto: AcceptInviteDto = {
        token,
        password: 'SecurePass123!',
      };

      const result = await service.acceptInvite(dto);

      expect(result.user).toEqual(existingUser);
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'existing-user-uuid', merchantId: 'merchant-b-uuid' },
      });
      expect(mockStaffProfileRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'existing-user-uuid',
          merchantId: 'merchant-b-uuid',
        }),
      );
      expect(mockStaffProfileRepository.save).toHaveBeenCalled();
    });

    it('should link existing user to merchant', async () => {
      const token = 'valid-token';
      const existingUser = {
        id: 'existing-user-uuid',
        email: 'staff@example.com',
      };

      const mockInvite = {
        token,
        email: 'staff@example.com',
        status: InviteStatus.PENDING,
        merchantId: 'merchant-uuid',
        merchant: { id: 'merchant-uuid' },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.ACCEPTED });
      mockMerchantRepository.findOne.mockResolvedValue({ id: 'merchant-uuid' });

      // StaffProfile: no existing profile for this merchant, create new one
      mockStaffProfileRepository.findOne.mockResolvedValue(null);
      mockStaffProfileRepository.create.mockReturnValue({
        userId: 'existing-user-uuid',
        merchantId: 'merchant-uuid',
      });
      mockStaffProfileRepository.save.mockResolvedValue({});

      const dto: AcceptInviteDto = {
        token,
        password: 'SecurePass123!',
      };

      const result = await service.acceptInvite(dto);

      expect(result.user).toEqual(existingUser);
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'existing-user-uuid', merchantId: 'merchant-uuid' },
      });
      expect(mockStaffProfileRepository.create).toHaveBeenCalled();
      expect(mockStaffProfileRepository.save).toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelInvite', () => {
    it('should cancel invite if user is inviter', async () => {
      const inviteId = 'invite-uuid';
      const userId = 'inviter-uuid';
      const mockInvite = {
        id: inviteId,
        status: InviteStatus.PENDING,
        invitedById: userId,
        merchant: { ownerId: 'owner-uuid' },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.CANCELLED });

      await service.cancelInvite(inviteId, userId);

      expect(mockInviteRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: InviteStatus.CANCELLED }),
      );
    });

    it('should cancel invite if user is merchant owner', async () => {
      const inviteId = 'invite-uuid';
      const userId = 'owner-uuid';
      const mockInvite = {
        id: inviteId,
        status: InviteStatus.PENDING,
        invitedById: 'inviter-uuid',
        merchant: { ownerId: userId },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);
      mockInviteRepository.save.mockResolvedValue({ ...mockInvite, status: InviteStatus.CANCELLED });

      await service.cancelInvite(inviteId, userId);

      expect(mockInviteRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user not authorized', async () => {
      const mockInvite = {
        id: 'invite-uuid',
        status: InviteStatus.PENDING,
        invitedById: 'inviter-uuid',
        merchant: { ownerId: 'owner-uuid' },
      };

      mockInviteRepository.findOne.mockResolvedValue(mockInvite);

      await expect(service.cancelInvite('invite-uuid', 'unauthorized-user')).rejects.toThrow(
        'Not authorized to cancel this invite',
      );
    });
  });
});
