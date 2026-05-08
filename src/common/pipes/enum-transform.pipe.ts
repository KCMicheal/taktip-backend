import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';
import { BusinessType } from '../../common/enums/business-type.enum';
import { EntityStatus } from '../../common/enums/entity-status.enum';
import { InviteStatus } from '../../common/enums/invite-status.enum';

interface EnumMap {
  [key: string]: Record<string, unknown>;
}

@Injectable()
export class EnumTransformPipe implements PipeTransform {
  private readonly enumMap: EnumMap = {
    role: Role as Record<string, unknown>,
    businessType: BusinessType as Record<string, unknown>,
    status: EntityStatus as Record<string, unknown>,
    inviteStatus: InviteStatus as Record<string, unknown>,
  };

  transform(value: Record<string, unknown>, _metadata: ArgumentMetadata): Record<string, unknown> {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const enumType = this.enumMap[key];
        if (enumType && typeof value[key] === 'string') {
          const strVal = value[key];

          // Case 1: It's a numeric string like "2" → convert directly to number
          const numericValue = Number(strVal);
          if (!isNaN(numericValue) && this.isValidNumericEnumValue(enumType, numericValue)) {
            value[key] = numericValue;
          }
          // Case 2: It's an enum key name like "MERCHANT" → look up its numeric value
          else if (strVal in enumType) {
            const resolved = enumType[strVal];
            if (typeof resolved === 'number') {
              value[key] = resolved;
            }
          }
        }
      }
    }
    return value;
  }

  private isValidNumericEnumValue(enumType: Record<string, unknown>, value: number): boolean {
    return Object.values(enumType).includes(value);
  }
}
