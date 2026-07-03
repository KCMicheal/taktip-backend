import { IsString, IsEnum, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification-type.enum';

export class BroadcastNotificationDto {
  @ApiProperty({
    description: 'Type of notification',
    enum: [NotificationType.SYSTEM, NotificationType.MARKETING],
    example: NotificationType.SYSTEM,
  })
  @IsEnum([NotificationType.SYSTEM, NotificationType.MARKETING])
  type: NotificationType;

  @ApiProperty({
    description: 'Notification headline',
    example: 'Scheduled Maintenance',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Notification message body',
    example: 'TakTip will be down for maintenance on July 5th from 2-4 AM WAT.',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Optional metadata for the notification',
    example: { maintenanceDate: '2026-07-05', duration: '2 hours' },
  })
  @IsOptional()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Specific user IDs to target. If omitted, broadcasts to all users.',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetUserIds?: string[];
}
