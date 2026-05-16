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

/**
 * Convert a numeric enum value to its string key name.
 * e.g., Role[2] → "MERCHANT"
 */
export function enumToString(enumObj: Record<string, unknown>, value: number): string | undefined {
  const key = enumObj[value];
  return typeof key === 'string' ? key : undefined;
}

/**
 * Convert a string enum key name to its numeric value.
 * e.g., Role["MERCHANT"] → 2
 */
export function stringToEnum(enumObj: Record<string, unknown>, key: string): number | undefined {
  const value = enumObj[key];
  return typeof value === 'number' ? value : undefined;
}
