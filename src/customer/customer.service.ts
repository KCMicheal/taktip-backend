import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerProfile } from './entities/customer-profile.entity';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
  ) {}

  /**
   * Find a customer profile by user ID.
   */
  async findByUserId(userId: string): Promise<CustomerProfile | null> {
    return this.customerProfileRepository.findOne({
      where: { userId },
    });
  }

  /**
   * Find a customer profile by user ID, or throw if not found.
   */
  async getByUserId(userId: string): Promise<CustomerProfile> {
    const profile = await this.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Customer profile not found. Please register as a customer first.');
    }
    return profile;
  }

  /**
   * Ensure a customer profile exists for this user.
   * Creates one if it doesn't exist (idempotent).
   */
  async getOrCreateProfile(userId: string): Promise<CustomerProfile> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const profile = this.customerProfileRepository.create({ userId });
    const saved = await this.customerProfileRepository.save(profile);
    this.logger.log(`Customer profile created for user ${userId} (id: ${saved.id})`);
    return saved;
  }
}
