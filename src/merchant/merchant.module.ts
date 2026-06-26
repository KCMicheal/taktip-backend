import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { StaffInvite } from './entities/staff-invite.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { WalletModule } from '../wallet/wallet.module';
import { TipsModule } from '../tips/tips.module';
import { QrCodesModule } from '../qrcodes/qrcodes.module';
import { MerchantService } from './merchant.service';
import { InviteService } from './services/invite.service';
import { MerchantController } from './merchant.controller';
import { AuthInviteController } from './controllers/auth-invite.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, StaffInvite, StaffProfile]), forwardRef(() => WalletModule), TipsModule, QrCodesModule],
  controllers: [MerchantController, AuthInviteController],
  providers: [MerchantService, InviteService],
  exports: [MerchantService, InviteService, TypeOrmModule],
})
export class MerchantModule {}