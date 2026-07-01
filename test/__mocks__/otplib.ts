/**
 * Mock for otplib v13+.
 * Provides synchronous mock implementations for TOTP operations.
 */

export const generateSecret = (): string => {
  return 'MOCKTOTPSECRETBASE32EXAMPLE123';
};

export const verifySync = (opts: { token: string; secret: string }): { valid: boolean } => {
  // Accept '123456' as the valid TOTP code for testing
  const isValid = opts.token === '123456';
  return { valid: isValid };
};

export const generateURI = (opts: {
  issuer?: string;
  label?: string;
  secret?: string;
}): string => {
  return `otpauth://totp/${opts.issuer ?? 'App'}:${encodeURIComponent(opts.label ?? 'user')}?secret=${opts.secret ?? ''}&issuer=${opts.issuer ?? 'App'}`;
};
