import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { StaffInvite } from '../entities/staff-invite.entity';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { Merchant } from '../entities/merchant.entity';
import { User } from '../../auth/entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { MailService } from '../../auth/services/mail.service';
import { InviteStaffDto, AcceptInviteDto } from '../dto/invite.dto';

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    @InjectRepository(StaffInvite)
    private readonly inviteRepository: Repository<StaffInvite>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a secure invite token
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Send invite email to the staff member
   */
  async sendInviteEmail(
    email: string,
    token: string,
    merchantName: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.io');

    const inviteLink = `${appUrl}/register/staff?token=${token}`;

    try {
      // Try MailJet first, fallback to nodemailer
      await this.mailService.sendStaffInviteEmail(email, merchantName, inviteLink);
      this.logger.log(`Invite email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Invite a staff member to join a merchant's business
   */
  async inviteStaff(
    merchantId: string,
    dto: InviteStaffDto,
    invitedById: string,
  ): Promise<StaffInvite> {
    // Check if merchant exists
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    // Check if user with this email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      // Check if they're already a member of this merchant
      // For now, just check if there's an existing pending invite
      const existingInvite = await this.inviteRepository.findOne({
        where: {
          email: dto.email,
          merchantId,
          status: InviteStatus.PENDING,
        },
      });

      if (existingInvite) {
        throw new BadRequestException('An invite has already been sent to this email');
      }

      // User exists - they can be added directly (future: link to merchant)
      // For now, we'll create an invite that will link to their existing account
    }

    // Check for existing pending invite
    const existingPendingInvite = await this.inviteRepository.findOne({
      where: {
        email: dto.email,
        merchantId,
        status: InviteStatus.PENDING,
      },
    });

    if (existingPendingInvite) {
      throw new BadRequestException('An invite is already pending for this email');
    }

    // Generate token and set expiry (24 hours)
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create invite
    const invite = this.inviteRepository.create({
      token,
      email: dto.email,
      merchantId,
      invitedById,
      status: InviteStatus.PENDING,
      expiresAt,
      role: dto.role || 'STAFF',
    });

    const savedInvite = await this.inviteRepository.save(invite);

    // Send invite email
    await this.sendInviteEmail(dto.email, token, merchant.name);

    return savedInvite;
  }

  /**
   * Validate an invite token
   */
  async validateToken(token: string): Promise<StaffInvite> {
    const invite = await this.inviteRepository.findOne({
      where: { token },
      relations: ['merchant', 'invitedBy'],
    });

    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }

    // Check if already accepted
    if (invite.status === InviteStatus.ACCEPTED) {
      throw new BadRequestException('This invite has already been used');
    }

    // Check if cancelled
    if (invite.status === InviteStatus.CANCELLED) {
      throw new BadRequestException('This invite has been cancelled');
    }

    // Check if expired
    if (new Date() > invite.expiresAt) {
      // Mark as expired
      invite.status = InviteStatus.EXPIRED;
      await this.inviteRepository.save(invite);
      throw new BadRequestException('This invite has expired');
    }

    return invite;
  }

  /**
   * Accept an invite and create/register the staff user
   */
  async acceptInvite(dto: AcceptInviteDto): Promise<{ user: User; merchant: Merchant }> {
    // Validate the token
    const invite = await this.validateToken(dto.token);

    // Check if user with this email already exists
    let user = await this.userRepository.findOne({
      where: { email: invite.email },
    });

    if (user) {
      // Link existing user to the merchant
      // Future: create BusinessMember record
      this.logger.log(`Linking existing user ${user.id} to merchant ${invite.merchantId}`);
    } else {
      // Create new user with STAFF role
      user = this.userRepository.create({
        email: invite.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: Role.STAFF,
        isActive: true,
      });

      user = await this.userRepository.save(user);
      this.logger.log(`Created new staff user ${user.id} for invite`);
    }

    // Update invite status
    invite.status = InviteStatus.ACCEPTED;
    invite.acceptedAt = new Date();
    invite.inviteeId = user.id;
    await this.inviteRepository.save(invite);

    // Get merchant details
    const merchant = await this.merchantRepository.findOne({
      where: { id: invite.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return { user, merchant };
  }

  /**
   * Cancel a pending invite (only the inviter or merchant owner can cancel)
   */
  async cancelInvite(inviteId: string, userId: string): Promise<void> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
      relations: ['merchant'],
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be cancelled');
    }

    // Check if user is authorized (inviter or merchant owner)
    if (invite.invitedById !== userId && invite.merchant.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this invite');
    }

    invite.status = InviteStatus.CANCELLED;
    await this.inviteRepository.save(invite);

    this.logger.log(`Invite ${inviteId} cancelled by user ${userId}`);
  }

  /**
   * Get all invites for a merchant
   */
  async getMerchantInvites(
    merchantId: string,
    userId: string,
  ): Promise<StaffInvite[]> {
    // Verify user has access to this merchant
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    // Only owner or admin can view invites (future: BusinessMember check)
    if (merchant.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to view invites for this merchant');
    }

    return this.inviteRepository.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }
}