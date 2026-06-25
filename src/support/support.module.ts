import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportService } from './support.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket]),
  ],
  providers: [SupportService],
  exports: [SupportService, TypeOrmModule],
})
export class SupportModule {}
