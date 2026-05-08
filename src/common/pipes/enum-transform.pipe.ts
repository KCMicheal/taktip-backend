import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';
import { BusinessType } from '../../common/enums/business-type.enum';
import { EntityStatus } from '../../common/enums/entity-status.enum';
import { InviteStatus } from '../../common/enums/invite-status.enum';

interface EnumMap {
  [key: string]: object;
}

@Injectable()
export class EnumTransformPipe implements PipeTransform {
  private readonly enumMap: EnumMap = {
    role: Role,
    businessType: BusinessType,
    status: EntityStatus,
    inviteStatus: InviteStatus,
  };

  transform(value: Record<string, unknown>, _metadata: ArgumentMetadata): Record<string, unknown> {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const enumType = this.enumMap[key];
        // If this field should be an enum and the value is a string
        if (enumType && typeof value[key] === 'string') {
          const numericValue = Number(value[key]);
          // Check if the numeric value is valid for this enum
          if (!isNaN(numericValue) && Object.values(enumType).includes(numericValue)) {
            value[key] = numericValue;
          }
        }
      }
    }
    return value;
  }
}
