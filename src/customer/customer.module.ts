import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from './entities/customer-profile.entity';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerProfile])],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService, TypeOrmModule],
})
export class CustomerModule {}
