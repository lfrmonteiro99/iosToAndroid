/**
 * Normalizes a phone number to a comparison key by stripping non-digit chars
 * and taking the last 9 digits (the national significant number length shared
 * across country-code / 00-prefixed / bare-national forms of the same number).
 * Numbers with 9 or fewer digits (emergency lines, short codes) are kept as-is
 * so they only ever match exactly, never as a suffix of a longer number.
 */
export function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * Shared contact matching utility. Matches phone numbers via normalizePhoneKey.
 */
export function findContactByPhone<T extends { phone: string }>(
  phone: string,
  contacts: T[],
): T | undefined {
  const key = normalizePhoneKey(phone);
  if (key.length === 0) return undefined;
  return contacts.find((c) => normalizePhoneKey(c.phone) === key);
}
