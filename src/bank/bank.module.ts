import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BankController } from './bank.controller';

@Module({
  imports: [ConfigModule],
  controllers: [BankController],
})
export class BankModule {}
