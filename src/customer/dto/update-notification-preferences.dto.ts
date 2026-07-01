import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Receive push notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Receive email notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Notify when a tip is received',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  tipReceived?: boolean;

  @ApiPropertyOptional({
    description: 'Notify when a tip is withdrawn',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  tipWithdrawn?: boolean;

  @ApiPropertyOptional({
    description: 'Receive marketing and promotional emails',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;
}
