import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja'] as const;
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'NGN', 'ZAR'] as const;

export class UpdateCustomerPreferencesDto {
  @ApiPropertyOptional({
    description: 'Preferred language/locale code',
    example: 'en',
    enum: SUPPORTED_LANGUAGES,
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: string;

  @ApiPropertyOptional({
    description: 'Preferred currency',
    example: 'USD',
    enum: SUPPORTED_CURRENCIES,
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @ApiPropertyOptional({
    description: 'IANA timezone string',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
