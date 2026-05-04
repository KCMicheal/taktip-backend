import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { StaffInvite } from './entities/staff-invite.entity';
import { MerchantService } from './merchant.service';
import { InviteService } from './services/invite.service';
import { MerchantController } from './merchant.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, StaffInvite])],
  controllers: [MerchantController],
  providers: [MerchantService, InviteService],
  exports: [MerchantService, InviteService, TypeOrmModule],
})
export class MerchantModule {}