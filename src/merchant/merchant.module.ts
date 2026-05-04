import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { MerchantService } from './merchant.service';
import { MerchantController } from './merchant.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService, TypeOrmModule],
})
export class MerchantModule {}