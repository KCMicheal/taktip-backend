import { SetMetadata } from '@nestjs/common';

// Throttle decorator constants
export const THROTTLE_LIMIT_KEY = 'throttle_limit';
export const THROTTLE_TTL_KEY = 'throttle_ttl';

/**
 * Custom throttle decorator to override global rate limits for specific endpoints
 * 
 * @example
 * // Apply custom throttle (10 requests per 30 seconds)
 * @Throttle({ limit: 10, ttl: 30000 })
 * @Post('login')
 * login() {}
 */
export function Throttle(options: { limit: number; ttl: number }): MethodDecorator {
  return (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    SetMetadata(THROTTLE_LIMIT_KEY, options.limit)(target, key, descriptor);
    SetMetadata(THROTTLE_TTL_KEY, options.ttl)(target, key, descriptor);
    return descriptor;
  };
}

/**
 * Shorthand decorator for login-specific rate limiting
 * Uses the configured login throttle (5 requests per 15 minutes)
 */
export function ThrottleLogin(): MethodDecorator {
  return Throttle({ limit: 5, ttl: 900000 });
}
