import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthInviteController } from '../../../src/merchant/controllers/auth-invite.controller';
import { InviteService } from '../../../src/merchant/services/invite.service';
import { InviteStatus } from '../../../src/common/enums/invite-status.enum';

describe('AuthInviteController', () => {
  let controller: AuthInviteController;
  let inviteService: InviteService;

  const mockInviteService = {
    validateToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthInviteController],
      providers: [
        {
          provide: InviteService,
          useValue: mockInviteService,
        },
      ],
    }).compile();

    controller = module.get<AuthInviteController>(AuthInviteController);
    inviteService = module.get<InviteService>(InviteService);

    jest.clearAllMocks();
  });

  describe('getInviteByToken', () => {
    it('should return invite info for a valid token with name', async () => {
      const mockInvite = {
        email: 'staff@example.com',
        name: 'Jane Doe',
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockInviteService.validateToken.mockResolvedValue(mockInvite);

      const result = await controller.getInviteByToken('valid-token');

      expect(result.status).toBe('success');
      expect(result.data.email).toBe('staff@example.com');
      expect(result.data.name).toBe('Jane Doe');
      expect(mockInviteService.validateToken).toHaveBeenCalledWith('valid-token');
    });

    it('should return invite info for a valid token without name', async () => {
      const mockInvite = {
        email: 'staff@example.com',
        name: null,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockInviteService.validateToken.mockResolvedValue(mockInvite);

      const result = await controller.getInviteByToken('valid-token');

      expect(result.status).toBe('success');
      expect(result.data.email).toBe('staff@example.com');
      expect(result.data.name).toBeNull();
    });

    it('should throw NotFoundException for invalid token', async () => {
      mockInviteService.validateToken.mockRejectedValue(
        new NotFoundException('Invalid invite token'),
      );

      await expect(controller.getInviteByToken('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockInviteService.validateToken).toHaveBeenCalledWith('invalid-token');
    });

    it('should throw BadRequestException for expired token', async () => {
      mockInviteService.validateToken.mockRejectedValue(
        new BadRequestException('This invite has expired'),
      );

      await expect(controller.getInviteByToken('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for already accepted token', async () => {
      mockInviteService.validateToken.mockRejectedValue(
        new BadRequestException('This invite has already been used'),
      );

      await expect(controller.getInviteByToken('used-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
