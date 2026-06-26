import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrCodesController } from './qrcodes.controller';
import { QrCodesService } from './qrcodes.service';
import { QrCode } from './entities/qrcode.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QrCode, Merchant, StaffProfile, CustomerProfile])],
  controllers: [QrCodesController],
  providers: [QrCodesService],
  exports: [QrCodesService, TypeOrmModule],
})
export class QrCodesModule {}
