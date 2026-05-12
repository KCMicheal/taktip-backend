import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffProfile } from './entities/staff-profile.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { PayoutMethodDto } from './dto/payout-method.dto';
import { Role } from '../auth/enums/role.enum';

/**
 * Response DTO for the staff dashboard
 */
export interface StaffDashboardDto {
  profile: {
    id: string;
    displayName: string | null;
    roleTag: string | null;
    isClockedIn: boolean;
    currentShiftId: string | null;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  merchant: {
    id: string;
    name: string;
    shortCode: string;
  } | null;
}

/**
 * Response DTO for staff settings
 */
export interface StaffSettingsDto {
  profile: {
    id: string;
    displayName: string | null;
    roleTag: string | null;
    isClockedIn: boolean;
    settings: Record<string, unknown> | null;
    payoutMethod: Record<string, unknown> | null;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  merchant: {
    id: string;
    name: string;
    shortCode: string;
  } | null;
}

/**
 * Response DTO for the staff profiles list
 */
export interface StaffProfilesListDto {
  profiles: Array<{
    profileId: string;
    merchantId: string | null;
    merchantName: string | null;
    merchantShortCode: string | null;
    roleTag: string | null;
    displayName: string | null;
  }>;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
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
   *
   * A user can have multiple staff profiles (one per merchant they work for).
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
   * GET /staff/profiles
   * Returns all merchant profiles for the authenticated user.
   */
  async getProfilesList(
    userId: string,
    userRole: Role,
  ): Promise<StaffProfilesListDto> {
    this.assertStaffRole(userRole);

    const profiles = await this.staffProfileRepository.find({
      where: { userId },
      relations: ['merchant'],
    });

    return {
      profiles: profiles.map(p => ({
        profileId: p.id,
        merchantId: p.merchantId,
        merchantName: p.merchant?.name || null,
        merchantShortCode: p.merchant?.shortCode || null,
        roleTag: p.roleTag,
        displayName: p.displayName,
      })),
    };
  }

  /**
   * GET /staff/dashboard
   * Returns basic profile info, user details, and associated merchant
   */
  async getDashboard(
    userId: string,
    userRole: Role,
    merchantId?: string,
  ): Promise<StaffDashboardDto> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    return {
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        roleTag: profile.roleTag,
        isClockedIn: profile.isClockedIn,
        currentShiftId: profile.currentShiftId,
      },
      user: {
        id: profile.user.id,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        phone: profile.user.phone,
      },
      merchant: profile.merchant
        ? {
            id: profile.merchant.id,
            name: profile.merchant.name,
            shortCode: profile.merchant.shortCode,
          }
        : null,
    };
  }

  /**
   * GET /staff/settings
   * Returns staff settings including payout method
   */
  async getSettings(
    userId: string,
    userRole: Role,
    merchantId?: string,
  ): Promise<StaffSettingsDto> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    return {
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        roleTag: profile.roleTag,
        isClockedIn: profile.isClockedIn,
        settings: profile.settings,
        payoutMethod: profile.payoutMethod,
      },
      user: {
        id: profile.user.id,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        phone: profile.user.phone,
      },
      merchant: profile.merchant
        ? {
            id: profile.merchant.id,
            name: profile.merchant.name,
            shortCode: profile.merchant.shortCode,
          }
        : null,
    };
  }

  /**
   * PATCH /staff/settings
   * Update staff profile settings (display name, role tag, notification prefs)
   */
  async updateSettings(
    userId: string,
    userRole: Role,
    dto: UpdateSettingsDto,
    merchantId?: string,
  ): Promise<StaffSettingsDto> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    if (dto.displayName !== undefined) {
      profile.displayName = dto.displayName;
    }
    if (dto.roleTag !== undefined) {
      profile.roleTag = dto.roleTag;
    }
    if (dto.settings !== undefined) {
      // Merge with existing settings instead of replacing
      profile.settings = {
        ...(profile.settings || {}),
        ...dto.settings,
      };
    }

    await this.staffProfileRepository.save(profile);

    return this.getSettings(userId, userRole, merchantId);
  }

  /**
   * POST /staff/settings/payout-method
   * Save or update payout method details
   */
  async savePayoutMethod(
    userId: string,
    userRole: Role,
    dto: PayoutMethodDto,
    merchantId?: string,
  ): Promise<{ message: string }> {
    this.assertStaffRole(userRole);

    const profile = await this.getProfile(userId, merchantId);

    // Validate account number (basic check)
    if (!/^\d{10}$/.test(dto.accountNumber)) {
      throw new BadRequestException(
        'Account number must be exactly 10 digits',
      );
    }

    profile.payoutMethod = {
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountHolderName: dto.accountHolderName || null,
      updatedAt: new Date().toISOString(),
    };

    await this.staffProfileRepository.save(profile);

    this.logger.log(`Payout method saved for staff user ${userId}`);

    return {
      message: 'Payout method saved successfully',
    };
  }
}
