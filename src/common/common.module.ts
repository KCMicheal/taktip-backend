import { Global, Module } from '@nestjs/common';
import { PaginationService } from './pagination/pagination.service';

/**
 * Global module that provides shared infrastructure utilities.
 *
 * Because it is decorated with @Global(), its providers (PaginationService)
 * are available in every module without needing to import CommonModule.
 */
@Global()
@Module({
  providers: [PaginationService],
  exports: [PaginationService],
})
export class CommonModule {}
