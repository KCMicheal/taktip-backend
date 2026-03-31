import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';
export const Public = (): PropertyDecorator => SetMetadata(PUBLIC_KEY, true);
export const publicDecorator = (): PropertyDecorator => Public;
