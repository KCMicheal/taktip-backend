import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shift } from './entities/shift.entity';
import { ShiftStaff } from './entities/shift-staff.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { ShiftsService } from './shifts.service';
import { MerchantShiftsService } from './merchant-shifts.service';
import { ShiftsController } from './shifts.controller';
import { MerchantShiftsController } from './merchant-shifts.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shift, ShiftStaff, StaffProfile, Merchant]),
    NotificationModule,
  ],
  controllers: [ShiftsController, MerchantShiftsController],
  providers: [ShiftsService, MerchantShiftsService],
  exports: [ShiftsService, MerchantShiftsService, TypeOrmModule],
})
export class ShiftsModule {}
