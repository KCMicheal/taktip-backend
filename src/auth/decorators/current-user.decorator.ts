import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const currentUserDecorator = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

export const CurrentUser = (
  ...args: Parameters<typeof currentUserDecorator>
): ReturnType<typeof currentUserDecorator> => {
  return currentUserDecorator(...args);
};
