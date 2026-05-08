// Helper for Swagger enum display
// TypeScript numeric enums (e.g., Role.CUSTOMER = 1) compile to
// { CUSTOMER: 1, MERCHANT: 2, 1: 'CUSTOMER', 2: 'MERCHANT' } at runtime.
// Object.values() includes both numeric and string entries.
// This helper extracts ONLY the string keys for Swagger display purposes,
// so the UI shows readable enum names instead of numeric values.
export function swaggerEnumValues(enumObj: object): string[] {
  return Object.values(enumObj).filter(
    (v): v is string => typeof v === 'string',
  );
}
