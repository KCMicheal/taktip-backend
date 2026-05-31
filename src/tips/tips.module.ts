import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipsController } from './tips.controller';
import { TipsService } from './tips.service';
import { Tip } from './entities/tip.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tip, StaffProfile, Merchant])],
  controllers: [TipsController],
  providers: [TipsService],
  exports: [TipsService, TypeOrmModule],
})
export class TipsModule {}
