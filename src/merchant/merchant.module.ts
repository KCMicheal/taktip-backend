import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { StaffInvite } from './entities/staff-invite.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { MerchantService } from './merchant.service';
import { InviteService } from './services/invite.service';
import { MerchantController } from './merchant.controller';
import { AuthInviteController } from './controllers/auth-invite.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, StaffInvite, StaffProfile])],
  controllers: [MerchantController, AuthInviteController],
  providers: [MerchantService, InviteService],
  exports: [MerchantService, InviteService, TypeOrmModule],
})
export class MerchantModule {}