// Role enum for authorization
// Based on TakTip business model:
// - MERCHANT: Business owners who receive tips on behalf of staff
// - STAFF: Employees who receive tips via merchant's QR code
// - ADMIN: Platform administrators
export enum Role {
  MERCHANT = 'MERCHANT',
  STAFF = 'STAFF',
  ADMIN = 'ADMIN',
}
