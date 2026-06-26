import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { QrCode } from './entities/qrcode.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { GenerateQrCodeDto } from './dto/generate-qrcode.dto';

@Injectable()
export class QrCodesService {
  private readonly logger = new Logger(QrCodesService.name);

  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a unique 8-character hex short code.
   * Checks the database for collisions before returning.
   */
  async generateShortCode(): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const shortCode = randomBytes(4).toString('hex');
      const existing = await this.qrCodeRepository.findOne({
        where: { shortCode },
      });
      if (!existing) {
        return shortCode;
      }
    }

    throw new ConflictException('Unable to generate unique short code');
  }

  /**
   * Generate a new QR code for a merchant.
   * Creates a short code, builds the tip URL, generates a QR code image
   * data URL, and persists the record.
   */
  async generateQrCode(
    merchantId: string,
    dto: GenerateQrCodeDto,
  ): Promise<{ qrCode: QrCode; qrDataUrl: string }> {
    const shortCode = await this.generateShortCode();
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'https://app.taktip.com',
    );
    const url = `${appUrl}/tip/${shortCode}`;

    // Generate the QR code as a data URL (base64 PNG)
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    const qrCode = this.qrCodeRepository.create({
      merchantId,
      staffProfileId: dto.staffProfileId || null,
      shortCode,
      url,
      isActive: true,
      metadata: dto.metadata || null,
    } as Partial<QrCode>);

    const saved = await this.qrCodeRepository.save(qrCode);

    this.logger.log(
      `QR code generated for merchant ${merchantId} (shortCode: ${shortCode})`,
    );

    return { qrCode: saved, qrDataUrl };
  }

  /**
   * Ensure a QR code exists for a staff profile.
   * Idempotent — skips if a QR code already exists for this staffProfileId.
   * Called when a staff invite is accepted and their profile is created.
   */
  async ensureStaffQrCode(staffProfileId: string, merchantId: string): Promise<void> {
    const existing = await this.qrCodeRepository.findOne({
      where: { staffProfileId },
    });
    if (existing) {
      this.logger.log(`QR code already exists for staff profile ${staffProfileId}, skipping`);
      return;
    }

    const shortCode = await this.generateShortCode();
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.com');
    const url = `${appUrl}/tip/${shortCode}`;

    const qrCode = this.qrCodeRepository.create({
      merchantId,
      staffProfileId,
      shortCode,
      url,
      isActive: true,
    } as Partial<QrCode>);

    await this.qrCodeRepository.save(qrCode);

    this.logger.log(`QR code auto-generated for staff profile ${staffProfileId}`);
  }

  /**
   * Ensure a QR code exists for a customer profile.
   * Idempotent — returns the existing QR if one already exists for this customerProfileId.
   * Also regenerates the QR image data URL for immediate display.
   */
  async ensureCustomerQrCode(customerProfileId: string): Promise<{ qrCode: QrCode; qrDataUrl: string }> {
    const existing = await this.qrCodeRepository.findOne({
      where: { customerProfileId },
    });
    if (existing) {
      // If the existing QR is inactive (deactivated), reactivate it
      if (!existing.isActive) {
        await this.qrCodeRepository.update(existing.id, { isActive: true });
        existing.isActive = true;
        this.logger.log(`Reactivated existing QR code for customer profile ${customerProfileId}`);
      }
      this.logger.log(`QR code already exists for customer profile ${customerProfileId}, returning existing`);
      const qrDataUrl = await QRCode.toDataURL(existing.url, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return { qrCode: existing, qrDataUrl };
    }

    const shortCode = await this.generateShortCode();
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.com');
    const url = `${appUrl}/tip/${shortCode}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    const qrCode = this.qrCodeRepository.create({
      customerProfileId,
      shortCode,
      url,
      isActive: true,
    } as Partial<QrCode>);

    const saved = await this.qrCodeRepository.save(qrCode);

    this.logger.log(`QR code auto-generated for customer profile ${customerProfileId}`);

    return { qrCode: saved, qrDataUrl };
  }

  /**
   * Find the QR code linked to a customer profile.
   * Returns null if no QR has been generated yet.
   */
  async findByCustomerProfile(customerProfileId: string): Promise<QrCode | null> {
    return this.qrCodeRepository.findOne({
      where: { customerProfileId },
    });
  }

  /**
   * Look up a QR code by its short code. Used by the public tip resolution endpoint.
   */
  async findByShortCode(shortCode: string): Promise<QrCode | null> {
    return this.qrCodeRepository.findOne({
      where: { shortCode, isActive: true },
    });
  }

  /**
   * Resolve a QR code by its short code and return enriched tip page data
   * including owner name, photo, and owner type.
   */
  async resolveByShortCode(shortCode: string): Promise<{
    qrCodeId: string;
    merchantId: string | null;
    staffProfileId: string | null;
    customerProfileId: string | null;
    ownerName: string;
    ownerPhoto: string | null;
    ownerType: 'merchant' | 'staff' | 'customer';
  } | null> {
    const qrCode = await this.findByShortCode(shortCode);
    if (!qrCode) return null;

    let ownerName: string;
    let ownerPhoto: string | null = null;
    let ownerType: 'merchant' | 'staff' | 'customer';

    if (qrCode.customerProfileId) {
      // Customer QR code — look up customer profile
      ownerType = 'customer';
      const customerProfile = await this.customerProfileRepository.findOne({
        where: { id: qrCode.customerProfileId },
        relations: ['user'],
      });
      if (customerProfile) {
        ownerName = customerProfile.displayName || customerProfile.user?.firstName || 'Customer';
        ownerPhoto = customerProfile.avatar || null;
      } else {
        ownerName = 'Customer';
      }
    } else if (qrCode.staffProfileId) {
      // Staff QR code — look up staff profile
      ownerType = 'staff';
      const staffProfile = await this.staffProfileRepository.findOne({
        where: { id: qrCode.staffProfileId },
        relations: ['user'],
      });
      if (staffProfile) {
        ownerName = staffProfile.displayName || staffProfile.user?.firstName || 'Staff';
        ownerPhoto = null; // Staff profiles don't have photo yet
      } else {
        ownerName = 'Staff';
      }
    } else if (qrCode.merchantId) {
      // Merchant QR code — look up merchant
      ownerType = 'merchant';
      const merchant = await this.merchantRepository.findOne({
        where: { id: qrCode.merchantId },
      });
      ownerName = merchant?.name || 'Merchant';
      ownerPhoto = merchant?.logoUrl || null;
    } else {
      // Fallback — no owner type could be determined
      ownerType = 'merchant';
      ownerName = 'Merchant';
      ownerPhoto = null;
    }

    return {
      qrCodeId: qrCode.id,
      merchantId: qrCode.merchantId,
      staffProfileId: qrCode.staffProfileId,
      customerProfileId: qrCode.customerProfileId,
      ownerName,
      ownerPhoto,
      ownerType,
    };
  }

  /**
   * List all QR codes belonging to a merchant.
   */
  async findByMerchant(merchantId: string): Promise<QrCode[]> {
    return this.qrCodeRepository.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List all QR codes linked to a staff profile (personal QR codes).
   */
  async findByStaffProfile(staffProfileId: string): Promise<QrCode[]> {
    return this.qrCodeRepository.find({
      where: { staffProfileId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List all QR codes belonging to one or more merchants that are accessible
   * to a staff member. Includes merchant-wide codes (staffProfileId = null)
   * and codes specifically linked to the staff's profiles.
   */
  async findByMerchantForStaff(
    merchantIds: string[],
    staffProfileIds?: string[],
  ): Promise<QrCode[]> {
    if (staffProfileIds && staffProfileIds.length > 0) {
      return this.qrCodeRepository.find({
        where: [
          { merchantId: In(merchantIds), staffProfileId: IsNull() as any },    // merchant-wide codes
          ...staffProfileIds.map((id) => ({ merchantId: In(merchantIds), staffProfileId: id })), // personal codes
        ],
        order: { createdAt: 'DESC' },
      });
    }
    return this.qrCodeRepository.find({
      where: { merchantId: In(merchantIds) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Deactivate a QR code by ID. Verifies the merchant owns the QR code.
   */
  async deactivate(id: string, merchantId: string): Promise<void> {
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id },
    });

    if (!qrCode) {
      throw new NotFoundException('QR code not found');
    }

    if (qrCode.merchantId !== merchantId) {
      throw new NotFoundException('QR code not found');
    }

    await this.qrCodeRepository.update(id, { isActive: false });

    this.logger.log(`QR code ${id} deactivated by merchant ${merchantId}`);
  }

  /**
   * Deactivate a QR code by ID. Verifies the customer owns the QR code.
   */
  async deactivateForCustomer(id: string, customerProfileId: string): Promise<void> {
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id },
    });

    if (!qrCode) {
      throw new NotFoundException('QR code not found');
    }

    if (qrCode.customerProfileId !== customerProfileId) {
      throw new NotFoundException('QR code not found');
    }

    await this.qrCodeRepository.update(id, { isActive: false });

    this.logger.log(`QR code ${id} deactivated by customer profile ${customerProfileId}`);
  }
}
