import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64Image } from '../../common/validators/is-base64-image.validator';

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({
    description: 'Display name shown to other customers',
    example: 'Johnny',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Base64-encoded avatar image (max 512×512px, 500KB). Formats: png, jpeg, webp.',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsOptional()
  @IsBase64Image(
    { maxWidth: 512, maxHeight: 512, maxSizeKb: 500 },
    { message: 'Avatar must be a valid base64 image (png/jpeg/webp) no larger than 512x512px and 500KB' },
  )
  avatar?: string;
}
