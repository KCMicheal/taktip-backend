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
import * as bcrypt from 'bcrypt';
import { StaffInvite } from '../entities/staff-invite.entity';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { Merchant } from '../entities/merchant.entity';
import { User } from '../../auth/entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { StaffProfile } from '../../staff/entities/staff-profile.entity';
import { MailService } from '../../auth/services/mail.service';
import { InviteStaffDto, AcceptInviteDto } from '../dto/invite.dto';

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(StaffInvite)
    private readonly inviteRepository: Repository<StaffInvite>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
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
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.com');

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

    // Check for existing invite (any status)
    const existingInvite = await this.inviteRepository.findOne({
      where: {
        email: dto.email,
        merchantId,
      },
    });

    if (existingInvite) {
      // If already pending, reject
      if (existingInvite.status === InviteStatus.PENDING) {
        throw new BadRequestException('An invite is already pending for this email');
      }

      // Otherwise, update the existing invite (cancelled, expired, accepted, etc.)
      const token = this.generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      existingInvite.token = token;
      existingInvite.expiresAt = expiresAt;
      existingInvite.status = InviteStatus.PENDING;
      existingInvite.role = dto.role || 'STAFF';
      existingInvite.name = dto.name || null;
      // Clear acceptedAt if it was accepted before
      existingInvite.acceptedAt = null;
      existingInvite.inviteeId = null;

      const savedInvite = await this.inviteRepository.save(existingInvite);

      // Send invite email
      await this.sendInviteEmail(dto.email, token, merchant.name);

      return savedInvite;
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
      name: dto.name || null,
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
      const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

      // Parse name from the invite record (set by merchant when inviting)
      let firstName: string | null = null;
      let lastName: string | null = null;
      if (invite.name) {
        const spaceIndex = invite.name.indexOf(' ');
        if (spaceIndex > 0) {
          firstName = invite.name.substring(0, spaceIndex);
          lastName = invite.name.substring(spaceIndex + 1).trim() || null;
        } else {
          firstName = invite.name;
        }
      }

      user = this.userRepository.create({
        email: invite.email,
        passwordHash,
        firstName,
        lastName,
        role: Role.STAFF,
        isActive: true,
        isEmailVerified: true
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

    // Create staff profile for this (user, merchant) pair if one doesn't exist
    // A user can have multiple staff profiles (one per merchant they work for)
    const existingProfile = await this.staffProfileRepository.findOne({
      where: { userId: user.id, merchantId: merchant.id },
    });

    if (!existingProfile) {
      const staffProfile = this.staffProfileRepository.create({
        userId: user.id,
        merchantId: merchant.id,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || null,
        roleTag: invite.role || 'STAFF',
        isClockedIn: false,
      });
      await this.staffProfileRepository.save(staffProfile);
      this.logger.log(`Staff profile created for user ${user.id} at merchant ${merchant.id}`);
    } else {
      this.logger.log(`Staff profile already exists for user ${user.id} at merchant ${merchant.id}, skipping creation`);
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