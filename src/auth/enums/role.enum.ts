// Role enum for authorization
// Note: Numeric values match database enum for compatibility
export enum Role {
  CUSTOMER = 1, // Optional account - tip staff, fund account, view history. CANNOT receive tips
  MERCHANT = 2, // Business owners
  STAFF = 3, // Employees
  ADMIN = 4, // Platform administrators
}