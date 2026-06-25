import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { imageSize } from 'image-size';
import { ISizeCalculationResult } from 'image-size/dist/types/interface';

export interface Base64ImageOptions {
  /** Max width in pixels (default: 512) */
  maxWidth?: number;
  /** Max height in pixels (default: 512) */
  maxHeight?: number;
  /** Max file size in kilobytes (default: 500) */
  maxSizeKb?: number;
}

/**
 * Checks whether a string is a valid base64-encoded image.
 * Validates format, decoded size, and image dimensions.
 *
 * @example
 * ```ts
 * @IsBase64Image({ maxWidth: 512, maxHeight: 512, maxSizeKb: 500 })
 * avatar?: string;
 * ```
 */
export function IsBase64Image(options?: Base64ImageOptions, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [options ?? {}],
      validator: IsBase64ImageConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isBase64Image', async: true })
class IsBase64ImageConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const options = (args.constraints[0] as Base64ImageOptions) ?? {};
    const maxWidth = options.maxWidth ?? 512;
    const maxHeight = options.maxHeight ?? 512;
    const maxSizeKb = options.maxSizeKb ?? 500;

    // 1. Check format: data:image/{png,jpeg,jpg,webp};base64,...
    const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      return false;
    }

    const base64Data = match[2];

    // 2. Check decoded size
    const decodedLength = Buffer.byteLength(base64Data, 'base64');
    const maxBytes = maxSizeKb * 1024;
    if (decodedLength > maxBytes) {
      return false;
    }

    // 3. Check image dimensions
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const dimensions: ISizeCalculationResult = imageSize(buffer);

      if (!dimensions || !dimensions.width || !dimensions.height) {
        return false;
      }

      if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const options = (args.constraints[0] as Base64ImageOptions) ?? {};
    const maxWidth = options.maxWidth ?? 512;
    const maxHeight = options.maxHeight ?? 512;
    const maxSizeKb = options.maxSizeKb ?? 500;

    return `Avatar must be a valid base64-encoded image (png/jpeg/webp) ` +
      `no larger than ${maxWidth}×${maxHeight}px and ${maxSizeKb}KB`;
  }
}
