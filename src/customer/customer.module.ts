import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from '../auth/entities/user.entity';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerProfile, User])],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService, TypeOrmModule],
})
export class CustomerModule {}
