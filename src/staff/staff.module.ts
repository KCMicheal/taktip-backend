import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffProfile } from './entities/staff-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StaffProfile])],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService, TypeOrmModule],
})
export class StaffModule {}
