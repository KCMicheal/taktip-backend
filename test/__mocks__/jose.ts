export const SignJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('mock-signature'),
}));

export const jwtVerify = jest.fn().mockResolvedValue({
  payload: {
    sub: 'user-id',
    role: 'MERCHANT',
  },
});

export const decodeJwt = jest.fn().mockReturnValue({
  sub: 'user-id',
  role: 'MERCHANT',
  iat: Date.now(),
  exp: Date.now() + 3600000,
});

export const importPKCS8 = jest.fn().mockResolvedValue({});
export const importSPKI = jest.fn().mockResolvedValue({});
