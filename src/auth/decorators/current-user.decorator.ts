import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface UserPayload {
  sub?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

interface AuthenticatedRequest {
  user?: UserPayload;
  [key: string]: unknown;
}

export const CurrentUserDecorator = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);

export const CurrentUser = CurrentUserDecorator;
