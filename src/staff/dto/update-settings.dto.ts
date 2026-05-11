import { IsString, IsOptional, MaxLength, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Display name shown on tip page',
    example: 'John the Bartender',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Role tag (e.g. waiter, bartender, host)',
    example: 'bartender',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleTag?: string;

  @ApiPropertyOptional({
    description: 'JSON object for notification preferences and other settings',
    example: { notifications: { push: true, email: false } },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
