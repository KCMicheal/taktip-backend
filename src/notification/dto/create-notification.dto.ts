import { IsString, IsEnum, IsOptional, IsObject, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification-type.enum';

export class CreateNotificationDto {
  @ApiProperty({
    description: 'User ID of the notification recipient',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Type of notification',
    enum: NotificationType,
    example: NotificationType.TIP_RECEIVED,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    description: 'Short notification headline',
    example: 'You received a tip!',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Human-readable notification message',
    example: 'N500.00 from John Doe',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Metadata for deep-linking or contextual actions',
    example: { tipId: 'abc-123', amount: 500, senderName: 'John Doe' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
